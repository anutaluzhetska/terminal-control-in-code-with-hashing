import bcrypt from "bcrypt";
import dotenv from "dotenv";
import pg from "pg";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

dotenv.config();

const { Pool } = pg;
const SALT_ROUNDS = 10;

const pool = new Pool({
  connectionString: `${process.env.DB_URL}`,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Ініціалізація таблиці
const initializeDatabase = async () => {
  const createTableQuery = `
        CREATE TABLE IF NOT EXISTS kotik (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,   
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   
    );
        `;
  try {
    await pool.query(createTableQuery);
  } catch (error) {
    console.error("Error initializing database:", error.message);
    throw error;
  }
};

// REGISTER - Реєстрація нового користувача
async function registerUser(email, password) {
  try {
    const lowEmail = email.toLowerCase();
    const checkUser = await pool.query(
      "SELECT email FROM kotik WHERE email = $1",
      [lowEmail],
    );
    if (checkUser.rows.length > 0) {
      console.log(
        `Error: User with email "${lowEmail}" already exists! Please choose another one.`,
      );
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const query = `
    INSERT INTO kotik (email, password_hash) 
    VALUES ($1, $2) 
    RETURNING id, email`;
    const res = await pool.query(query, [lowEmail, hash]);
    console.log("User registered successfully:", res.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      console.error("Error: User with this email already exists!");
    } else {
      console.error("Registration error:", err.message);
    }
  }
}

// LOGIN -  Перевірка пароля
async function loginUser(email, password) {
  try {
    const lowEmail = email.toLowerCase();
    const res = await pool.query(
      "SELECT * FROM kotik WHERE LOWER(email) = LOWER($1)",
      [lowEmail],
    );

    if (res.rows.length === 0) {
      console.log("Access denied: User not found.");
      return false;
    }

    const isMatch = await bcrypt.compare(password, res.rows[0].password_hash);
    if (isMatch) {
      console.log(`Welcome, ${lowEmail}! Login successful.`);
      return true;
    } else {
      console.log("Access denied: Incorrect password.");
      return false;
    }
  } catch (err) {
    console.error("Login error:", err.message);
    return false;
  }
}

// LIST - Перегляд усіх користувачів
async function getAllUsers() {
  try {
    const res = await pool.query("SELECT id, email FROM kotik ORDER BY id ASC");
    const simplifiedUsers = res.rows.map(({ id, email }) => ({ id, email }));

    console.log("List of users(id and username):");
    if (simplifiedUsers.length > 0) {
      console.table(simplifiedUsers);
    } else {
      console.log("There are no users yet.");
    }
  } catch (error) {
    console.log("Error retrieving list:", error.message);
  }
}

// DELETE - Видалення користувача за ID
async function deleteUser(email) {
  try {
    const lowEmail = email.toLowerCase();
    const res = await pool.query("DELETE FROM kotik WHERE email = $1", [
      lowEmail,
    ]);
    if (res.rowCount > 0) {
      console.log(`User with email "${lowEmail}" has been removed.`);
    } else {
      console.log(`User with email "${lowEmail}" not found.`);
    }
  } catch (err) {
    console.error("Delete error:", err.message);
  }
}

// UPDATE - Оновлення пароля користувача
async function updateUserPassword(email, newPassword) {
  try {
    const lowEmail = email.toLowerCase();
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const query =
      "UPDATE kotik SET password_hash = $1 WHERE email = $2 RETURNING id, email";
    const res = await pool.query(query, [newHash, lowEmail]);

    if (res.rows.length > 0) {
      console.log(
        `Password for user "${lowEmail}" has been successfully updated.`,
      );
    } else {
      console.log(`User with eamil "${lowEmail}" not found.`);
    }
  } catch (error) {
    console.error("Password update error:", error.message);
  }
}

const dataEntryViaTerminal = async () => {
  const command = process.argv[2];
  const rl = readline.createInterface({ input, output });

  try {
    await initializeDatabase();

    const askCredentials = async () => {
      const email = await rl.question("Enter email: ");
      const password = await rl.question("Enter password: ");
      console.log(`\nUser: ${email}`);
      console.log(`Password: ${"*".repeat(password.length)}\n`);
      return { email, password };
    };

    switch (command) {
      case "list":
        await getAllUsers();
        break;

      case "register":
        const reg = await askCredentials();
        await registerUser(reg.email, reg.password);
        break;

      case "login":
        const log = await askCredentials();
        await loginUser(log.email, log.password);
        break;

      case "delete":
        const del = await askCredentials();
        const canDelete = await loginUser(del.email, del.password);
        if (canDelete) {
          await deleteUser(del.email);
        }
        break;

      case "update":
        const upd = await askCredentials();
        const canUpdate = await loginUser(upd.email, upd.password);
        if (canUpdate) {
          const newPass = await rl.question("Enter NEW password: ");
          await updateUserPassword(upd.email, newPass);
        }
        break;

      default:
        console.log(`
Available commands:
  node room.js list     - Show all users
  node room.js register - Create new user
  node room.js login    - Login to system
  node room.js delete   - Remove your account
  node room.js update   - Change your password
    `);
        break;
    }
  } catch (err) {
    console.log("System Error:", err.message);
  } finally {
    rl.close();
    await pool.end();
    process.exit();
  }
};

dataEntryViaTerminal();

// node room.js list
// node room.js register
// node room.js login
// node room.js delete
// node room.js update
