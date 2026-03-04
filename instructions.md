# Instructions: Loan Recovery Management System (LRMS)

Me system eka hadala thiyenne GSCS Bank eke Loan Officers lata "Non-Performing Loans" saha recovery process eka pahasuwen track karaganna.

---

## 1. System Overview
System eke pradhana aramuna wenne customer kenekge loan ekakata gaththa hama recovery action ekakma (Calls, Letters, LOD) eka thanaka record kara ganeema saha ewa report ekak widiyata Director Board ekata idiripath kireemayi.

---

## 2. System Requirements (Functional)

### A. Customer & Loan Management
- **Search Function:** Account number eka gahuwa gaman customer details labiya yuthuya.
- **Loan Details:** Account Number, Customer Name, Loan Amount, Interest Rate, Guarantors (Names & IDs), Loan Category (Personal, Business, etc.).
- **Categorization:** Customer status eka mark kireema (Normal, Risky, Legal Action).

### B. Action Tracking (History)
- **Action Logs:** Hamawitama ganna kriyamaarga (Step-by-step) record kireeme hakiyawa.
    - Call Mathak kireema.
    - Attention Letter 1, 2, 3.
    - Letter of Demand (LOD).
- **Date & Response:** Action eka gaththa dawasa saha customer dunnapilithura/prathicharyawa note kireema.

### C. Reporting & Printing
- **Board Report:** Board ekata denna puluwan widiyata clean PDF/Print format ekakin report eka gatha haki wenna ona.
- **Filtering:** - Nithimaya kriyamaarga walata yomu karapu aya pamanak list kireema.
    - Awadanm (High Risk) mattame inna aya pamanak list kireema.

---

## 3. Technical Requirements (Tech Stack)

| Component | Technology |
| :--- | :--- |
| **Frontend** | HTML5, JavaScript (ES6+) |
| **Styling** | Tailwind CSS (CDN or CLI) |
| **Database** | Dexie.js (IndexedDB wrapper for local storage) |
| **Icons** | Lucide-icons or FontAwesome |
| **Print Support** | CSS Print Media Queries |

---

## 4. Database Schema (Dexie.js)

Database eka `RecoveryDB` lesa nam kara pahatha tables (Stores) hadanna:

- **customers:** `++id, accountNo, name, loanAmount, rate, category, status`
- **actions:** `++id, customerAccountNo, actionType, date, response, officerNote`

---

## 5. Implementation Instructions (Step-by-Step)

### Step 1: Project Structure
Mulinma folder ekak hada ganna:
- `index.html` (Main Dashboard)
- `customer-detail.html` (View/Add actions)
- `reports.html` (Filtering & Printing)
- `js/app.js` (Logic & Dexie setup)

### Step 2: Database Setup (JS)
```javascript
const db = new Dexie("RecoveryDB");
db.version(1).stores({
    customers: '++id, accountNo, name, status',
    actions: '++id, customerAccountNo, actionType, date'
});