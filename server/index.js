import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import natural from 'natural';
import nlp from 'compromise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;
const JWT_SECRET = 'vipra_co_hr_assistant_secret_key_2025';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database(':memory:');

// Initialize database with schema and sample data
const initializeDatabase = async () => {
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      // Organizations table
      db.run(`
        CREATE TABLE Organizations (
          organization_id VARCHAR(50) PRIMARY KEY,
          org_name VARCHAR(255) NOT NULL,
          subscription_plan VARCHAR(50),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Users table
      db.run(`
        CREATE TABLE Users (
          user_id VARCHAR(50) PRIMARY KEY,
          organization_id VARCHAR(50) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(100) NOT NULL,
          manager_id VARCHAR(50),
          date_of_joining DATE NOT NULL,
          department VARCHAR(100),
          location VARCHAR(100),
          FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
          FOREIGN KEY (manager_id) REFERENCES Users(user_id)
        )
      `);

      // LeaveBalances table
      db.run(`
        CREATE TABLE LeaveBalances (
          balance_id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id VARCHAR(50) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          leave_type VARCHAR(50) NOT NULL,
          total_allotted INTEGER NOT NULL,
          leaves_taken INTEGER NOT NULL DEFAULT 0,
          leaves_pending_approval INTEGER NOT NULL DEFAULT 0,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
          FOREIGN KEY (user_id) REFERENCES Users(user_id)
        )
      `);

      // CompanyPolicies table
      db.run(`
        CREATE TABLE CompanyPolicies (
          policy_id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id VARCHAR(50) NOT NULL,
          policy_title VARCHAR(255) NOT NULL,
          policy_category VARCHAR(100),
          policy_content TEXT NOT NULL,
          last_reviewed DATE,
          keywords TEXT,
          FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id)
        )
      `);

      // PayrollData table
      db.run(`
        CREATE TABLE PayrollData (
          payroll_id INTEGER PRIMARY KEY AUTOINCREMENT,
          organization_id VARCHAR(50) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          base_salary DECIMAL(10, 2) NOT NULL,
          HRA DECIMAL(10, 2),
          conveyance_allowance DECIMAL(10, 2),
          medical_allowance DECIMAL(10, 2),
          pf_deduction DECIMAL(10, 2),
          esi_deduction DECIMAL(10, 2),
          professional_tax DECIMAL(10, 2),
          ctc DECIMAL(10, 2) NOT NULL,
          FOREIGN KEY (organization_id) REFERENCES Organizations(organization_id),
          FOREIGN KEY (user_id) REFERENCES Users(user_id)
        )
      `, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });

  await insertSampleData();
};

const insertSampleData = async () => {
  // Organizations
  const organizations = [
    ['TECHCORP_IN', 'TechCorp Innovations Pvt. Ltd.', 'Basic'],
    ['MGFAB_GLOBAL', 'Muzaffarpur Global Fabricators', 'Standard'],
    ['EDU_INST', 'BMS Education Institute', 'Enterprise']
  ];

  organizations.forEach(org => {
    db.run('INSERT INTO Organizations (organization_id, org_name, subscription_plan) VALUES (?, ?, ?)', org);
  });

  // Hash passwords
  const hashedPasswords = {};
  const passwords = ['ananya123', 'rahul123', 'priya123', 'amit123', 'suresh123', 'geeta123'];
  
  for (let i = 0; i < passwords.length; i++) {
    hashedPasswords[i] = await bcrypt.hash(passwords[i], 10);
  }

  // Users
  const users = [
    ['TCI_MGR001', 'TECHCORP_IN', 'Ananya', 'Sharma', 'ananya.sharma@techcorp.com', hashedPasswords[0], 'Manager', null, '2020-01-15', 'Engineering', 'Bangalore'],
    ['TCI_EMP002', 'TECHCORP_IN', 'Rahul', 'Verma', 'rahul.verma@techcorp.com', hashedPasswords[1], 'Employee', 'TCI_MGR001', '2021-03-10', 'Engineering', 'Bangalore'],
    ['TCI_HR003', 'TECHCORP_IN', 'Priya', 'Singh', 'priya.singh@techcorp.com', hashedPasswords[2], 'Admin', null, '2019-07-20', 'Human Resources', 'Bangalore'],
    ['TCI_EMP004', 'TECHCORP_IN', 'Amit', 'Kumar', 'amit.kumar@techcorp.com', hashedPasswords[3], 'Employee', 'TCI_MGR001', '2022-06-01', 'Engineering', 'Bangalore'],
    ['MGF_MGR001', 'MGFAB_GLOBAL', 'Suresh', 'Kumar', 'suresh.kumar@mgfab.com', hashedPasswords[4], 'Manager', null, '2018-05-01', 'Production', 'Muzaffarpur, UP'],
    ['MGF_EMP002', 'MGFAB_GLOBAL', 'Geeta', 'Devi', 'geeta.devi@mgfab.com', hashedPasswords[5], 'Employee', 'MGF_MGR001', '2022-09-01', 'Quality Control', 'Muzaffarpur, UP']
  ];

  users.forEach(user => {
    db.run('INSERT INTO Users (user_id, organization_id, first_name, last_name, email, password_hash, role, manager_id, date_of_joining, department, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', user);
  });

  // Leave Balances
  const leaveBalances = [
    ['TECHCORP_IN', 'TCI_EMP002', 'Casual Leave', 12, 5, 0],
    ['TECHCORP_IN', 'TCI_EMP002', 'Sick Leave', 8, 2, 0],
    ['TECHCORP_IN', 'TCI_EMP002', 'Earned Leave', 18, 6, 2],
    ['TECHCORP_IN', 'TCI_MGR001', 'Casual Leave', 12, 3, 0],
    ['TECHCORP_IN', 'TCI_EMP004', 'Casual Leave', 12, 1, 0],
    ['MGFAB_GLOBAL', 'MGF_EMP002', 'Casual Leave', 10, 4, 0],
    ['MGFAB_GLOBAL', 'MGF_EMP002', 'Sick Leave', 7, 1, 0]
  ];

  leaveBalances.forEach(balance => {
    db.run('INSERT INTO LeaveBalances (organization_id, user_id, leave_type, total_allotted, leaves_taken, leaves_pending_approval) VALUES (?, ?, ?, ?, ?, ?)', balance);
  });

  // Company Policies
  const policies = [
    ['TECHCORP_IN', 'Work from Home Policy', 'HR General', 'Employees are allowed to work from home for up to 2 days a week, with prior manager approval. Ensure stable internet connection and productive environment. This applies to all non-production roles.', '2024-10-01', 'WFH, remote, flexible, home, policy'],
    ['TECHCORP_IN', 'Travel & Expense Policy', 'Expense', 'All business travel expenses must be pre-approved by your manager. Reimbursements require submission of original receipts within 7 days. Daily allowance for domestic travel is INR 1500.', '2023-11-15', 'travel, expense, reimbursement, allowance, policy'],
    ['TECHCORP_IN', 'Next Company Holiday', 'Calendar', 'The next company holiday for all TechCorp employees in Bangalore is Independence Day, August 15, 2025.', '2025-01-01', 'holiday, vacation, August 15, Independence Day'],
    ['MGFAB_GLOBAL', 'Attendance & Punctuality Policy', 'HR General', 'All factory employees must clock in daily using biometric scanners. Lateness will result in a deduction from pay after 3 instances. Strict adherence to shift timings is required.', '2024-03-01', 'attendance, punctuality, clock-in, biometric, policy'],
    ['MGFAB_GLOBAL', 'Safety Regulations Policy', 'Safety', 'All personnel must wear mandatory safety gear (helmets, gloves, safety shoes) in production areas. Report any hazards immediately. Regular safety drills are conducted.', '2024-01-20', 'safety, regulations, PPE, hazards, drills, policy'],
    ['MGFAB_GLOBAL', 'UP State Holidays 2025', 'Calendar', 'Upcoming public holidays in UP for 2025 include Diwali (Oct 29), Chhath Puja (Nov 5-6), and Christmas (Dec 25).', '2025-01-01', 'UP, holiday, public holiday, festival']
  ];

  policies.forEach(policy => {
    db.run('INSERT INTO CompanyPolicies (organization_id, policy_title, policy_category, policy_content, last_reviewed, keywords) VALUES (?, ?, ?, ?, ?, ?)', policy);
  });

  
  // Payroll Data
  const payrollData = [
    ['TECHCORP_IN', 'TCI_MGR001', 80000.00, 40000.00, 8000.00, 3000.00, 9600.00, 0.00, 200.00, 150000.00],
    ['TECHCORP_IN', 'TCI_EMP002', 45000.00, 22500.00, 4500.00, 1500.00, 5400.00, 0.00, 150.00, 85000.00],
    ['MGFAB_GLOBAL', 'MGF_MGR001', 60000.00, 30000.00, 6000.00, 2000.00, 7200.00, 1800.00, 100.00, 110000.00],
    ['MGFAB_GLOBAL', 'MGF_EMP002', 30000.00, 15000.00, 3000.00, 1000.00, 3600.00, 900.00, 50.00, 55000.00]
  ];

  payrollData.forEach(payroll => {
    db.run('INSERT INTO PayrollData (organization_id, user_id, base_salary, HRA, conveyance_allowance, medical_allowance, pf_deduction, esi_deduction, professional_tax, ctc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', payroll);
  });
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM Users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user.user_id, 
        organizationId: user.organization_id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        userId: user.user_id,
        organizationId: user.organization_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        department: user.department,
        location: user.location
      }
    });
  });
});

// Chat endpoint with NLP processing
app.post('/api/chat', authenticateToken, (req, res) => {
  const { message } = req.body;
  const { userId, organizationId } = req.user;

  // Process the message using NLP
  processQuery(message, userId, organizationId)
    .then(response => {
      res.json({ response });
    })
    .catch(error => {
      console.error('Chat processing error:', error);
      res.status(500).json({ error: 'Failed to process query' });
    });
});

// NLP Query Processing
const processQuery = async (query, userId, organizationId) => {
  const lowerQuery = query.toLowerCase();
  
  // Personal Information queries
  if (lowerQuery.includes('employee id') || lowerQuery.includes('my id')) {
    return `Your employee ID is: ${userId}`;
  }

  if (lowerQuery.includes('role') || lowerQuery.includes('designation') || lowerQuery.includes('position')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT role, department FROM Users WHERE user_id = ? AND organization_id = ?', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else resolve(`Your current role is: ${row?.role} in the ${row?.department} department.`);
        });
    });
  }

  if (lowerQuery.includes('manager') || lowerQuery.includes('supervisor')) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT u2.first_name, u2.last_name, u2.email 
              FROM Users u1 
              JOIN Users u2 ON u1.manager_id = u2.user_id 
              WHERE u1.user_id = ? AND u1.organization_id = ?`, 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Your manager is: ${row.first_name} ${row.last_name} (${row.email})`);
          } else {
            resolve("You don't have a manager assigned or you might be at the top level.");
          }
        });
    });
  }

  if (lowerQuery.includes('join') && (lowerQuery.includes('date') || lowerQuery.includes('when'))) {
    return new Promise((resolve, reject) => {
      db.get('SELECT date_of_joining FROM Users WHERE user_id = ? AND organization_id = ?', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else resolve(`You joined the company on: ${row?.date_of_joining}`);
        });
    });
  }

  // Leave Management queries
  if (lowerQuery.includes('casual leave') && (lowerQuery.includes('balance') || lowerQuery.includes('left') || lowerQuery.includes('remaining'))) {
    return new Promise((resolve, reject) => {
      db.get('SELECT total_allotted, leaves_taken FROM LeaveBalances WHERE user_id = ? AND organization_id = ? AND leave_type = "Casual Leave"', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            const remaining = row.total_allotted - row.leaves_taken;
            resolve(`You have ${remaining} casual leaves remaining out of ${row.total_allotted} allotted for this year.`);
          } else {
            resolve("No casual leave information found for your account.");
          }
        });
    });
  }

  if (lowerQuery.includes('earned leave') && (lowerQuery.includes('balance') || lowerQuery.includes('left') || lowerQuery.includes('remaining'))) {
    return new Promise((resolve, reject) => {
      db.get('SELECT total_allotted, leaves_taken FROM LeaveBalances WHERE user_id = ? AND organization_id = ? AND leave_type = "Earned Leave"', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            const remaining = row.total_allotted - row.leaves_taken;
            resolve(`You have ${remaining} earned leaves remaining out of ${row.total_allotted} allotted for this year.`);
          } else {
            resolve("No earned leave information found for your account.");
          }
        });
    });
  }

  if (lowerQuery.includes('sick leave') && (lowerQuery.includes('balance') || lowerQuery.includes('taken') || lowerQuery.includes('used'))) {
    return new Promise((resolve, reject) => {
      db.get('SELECT total_allotted, leaves_taken FROM LeaveBalances WHERE user_id = ? AND organization_id = ? AND leave_type = "Sick Leave"', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            const remaining = row.total_allotted - row.leaves_taken;
            resolve(`You have taken ${row.leaves_taken} sick leaves and have ${remaining} remaining out of ${row.total_allotted} allotted.`);
          } else {
            resolve("No sick leave information found for your account.");
          }
        });
    });
  }

  if (lowerQuery.includes('pending') && lowerQuery.includes('leave')) {
    return new Promise((resolve, reject) => {
      db.all('SELECT leave_type, leaves_pending_approval FROM LeaveBalances WHERE user_id = ? AND organization_id = ? AND leaves_pending_approval > 0', 
        [userId, organizationId], (err, rows) => {
          if (err) reject(err);
          else if (rows.length > 0) {
            const pendingLeaves = rows.map(row => `${row.leaves_pending_approval} ${row.leave_type}`).join(', ');
            resolve(`You have the following leaves pending approval: ${pendingLeaves}`);
          } else {
            resolve("You have no leaves pending approval.");
          }
        });
    });
  }

  // Payroll queries
  if (lowerQuery.includes('salary') || lowerQuery.includes('base salary')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT base_salary FROM PayrollData WHERE user_id = ? AND organization_id = ?', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Your current base salary is: ₹${row.base_salary.toLocaleString('en-IN')}`);
          } else {
            resolve("Salary information not available for your account.");
          }
        });
    });
  }

  if (lowerQuery.includes('ctc') || lowerQuery.includes('cost to company')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT ctc FROM PayrollData WHERE user_id = ? AND organization_id = ?', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Your CTC (Cost to Company) is: ₹${row.ctc.toLocaleString('en-IN')}`);
          } else {
            resolve("CTC information not available for your account.");
          }
        });
    });
  }

  if (lowerQuery.includes('pf') || lowerQuery.includes('provident fund')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT pf_deduction FROM PayrollData WHERE user_id = ? AND organization_id = ?', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Your PF (Provident Fund) deduction is: ₹${row.pf_deduction.toLocaleString('en-IN')} per month`);
          } else {
            resolve("PF deduction information not available for your account.");
          }
        });
    });
  }

  if (lowerQuery.includes('hra') || lowerQuery.includes('house rent')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT HRA FROM PayrollData WHERE user_id = ? AND organization_id = ?', 
        [userId, organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Your HRA (House Rent Allowance) is: ₹${row.HRA.toLocaleString('en-IN')} per month`);
          } else {
            resolve("HRA information not available for your account.");
          }
        });
    });
  }

  // Policy queries
  if (lowerQuery.includes('work from home') || lowerQuery.includes('wfh') || lowerQuery.includes('remote')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT policy_content FROM CompanyPolicies WHERE organization_id = ? AND policy_title LIKE "%Work from Home%"', 
        [organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Work from Home Policy: ${row.policy_content}`);
          } else {
            resolve("Work from home policy not found for your organization.");
          }
        });
    });
  }

  if (lowerQuery.includes('holiday') || lowerQuery.includes('vacation')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT policy_content FROM CompanyPolicies WHERE organization_id = ? AND policy_category = "Calendar"', 
        [organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Holiday Information: ${row.policy_content}`);
          } else {
            resolve("Holiday information not found for your organization.");
          }
        });
    });
  }

  if (lowerQuery.includes('safety') || lowerQuery.includes('regulations')) {
    return new Promise((resolve, reject) => {
      db.get('SELECT policy_content FROM CompanyPolicies WHERE organization_id = ? AND policy_title LIKE "%Safety%"', 
        [organizationId], (err, row) => {
          if (err) reject(err);
          else if (row) {
            resolve(`Safety Regulations: ${row.policy_content}`);
          } else {
            resolve("Safety regulations not found for your organization.");
          }
        });
    });
  }

  // Default response
  return "I'm sorry, I didn't understand your question. You can ask me about your leave balance, salary information, company policies, manager details, or personal information. Try asking something like 'How many casual leaves do I have left?' or 'What is my base salary?'";
};

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  const { userId, organizationId } = req.user;

  db.get(`SELECT u.*, o.org_name, m.first_name as manager_first_name, m.last_name as manager_last_name
          FROM Users u 
          LEFT JOIN Organizations o ON u.organization_id = o.organization_id
          LEFT JOIN Users m ON u.manager_id = m.user_id
          WHERE u.user_id = ? AND u.organization_id = ?`, 
    [userId, organizationId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        userId: user.user_id,
        organizationId: user.organization_id,
        organizationName: user.org_name,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        department: user.department,
        location: user.location,
        dateOfJoining: user.date_of_joining,
        manager: user.manager_first_name ? `${user.manager_first_name} ${user.manager_last_name}` : null
      });
    });
});

// Initialize database and start server
const startServer = async () => {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

if (process.env.NODE_ENV !== 'production') {
  startServer();
}

export default app;