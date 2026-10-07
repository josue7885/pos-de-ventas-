const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const locks=new Set();
process.on('exit',()=>{for(const release of locks){try{release();}catch{}}});
let sqlPromise;
async function initializeDatabase({directory=path.resolve(process.env.POS_DATA_DIR || __dirname),adminPin=process.env.POS_ADMIN_PIN || '',adminName='Administrador'}={}) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const release=require('./data-lock').acquireDataLock(directory);locks.add(release);
  const unlock=()=>{release();locks.delete(release);};
  try{return await openDatabase(path.join(directory,'pos.db'),adminPin,adminName,unlock);}
  catch(error){unlock();throw error;}
}
async function openDatabase(dbPath,adminPin,adminName,releaseLock) {
  const SQL=await (sqlPromise ||= require('sql.js')());
  let sqlite = new SQL.Database(fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined);
  let inTransaction = false;
  function persist() {
    const temporary = dbPath + '.tmp';
    const fd = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(fd, Buffer.from(sqlite.export())); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, dbPath);
  }
  const db = {
    transaction(work) {
      return (...args) => {
        if (inTransaction) return work(...args);
        const before = sqlite.export();
        inTransaction = true;
        sqlite.run('BEGIN IMMEDIATE');
        try {
          const result = work(...args);
          if (result && typeof result.then === 'function') throw new Error('Las transacciones deben ser síncronas');
          sqlite.run('COMMIT');
          persist();
          return result;
        } catch (error) {
          try { sqlite.run('ROLLBACK'); } catch (_) {}
          sqlite.close();
          sqlite = new SQL.Database(before);
          throw error;
        } finally { inTransaction = false; }
      };
    },
    prepare(sql) {
      const query = (mode, params) => {
        if (params.length === 1 && Array.isArray(params[0])) params = params[0];
        const statement = sqlite.prepare(sql);
        try {
          statement.bind(params);
          if (mode === 'run') {
            statement.step();
            return { changes: sqlite.getRowsModified(), lastInsertRowid: Number(sqlite.exec('SELECT last_insert_rowid()')[0]?.values[0][0] || 0) };
          }
          const rows = [];
          while (statement.step()) { rows.push(statement.getAsObject()); if (mode === 'get') break; }
          return mode === 'get' ? rows[0] : rows;
        } finally { statement.free(); }
      };
      return {
        run: (...params) => inTransaction ? query('run', params) : db.transaction(() => query('run', params))(),
        get: (...params) => query('get', params),
        all: (...params) => query('all', params)
      };
    },
    close() { sqlite.close();releaseLock(); }
  };
  db.transaction(() => {
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      role TEXT,
      pin TEXT
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT,
      category TEXT,
      price REAL,
      stock INTEGER
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY,
      employee_name TEXT,
      payment_method TEXT,
      total REAL,
      subtotal REAL,
      tax REAL,
      created_at TEXT,
      received_amount REAL,
      change_amount REAL,
      customer_name TEXT,
      customer_nit TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      document_type TEXT,
      customer_id INTEGER
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT,
      nit TEXT,
      dui TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      document_type TEXT DEFAULT 'consumidor_final',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY,
      sale_id INTEGER,
      product_id INTEGER,
      name TEXT,
      price REAL,
      qty INTEGER
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY,
      sale_id INTEGER,
      number TEXT,
      xml TEXT,
      pdf_path TEXT,
      customer_name TEXT,
      customer_nit TEXT,
      customer_email TEXT,
      document_type TEXT,
      printed INTEGER DEFAULT 0
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      employee_name TEXT,
      table_number TEXT,
      customer_name TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      total REAL,
      created_at TEXT
    )`).run();

    const ensureColumn = (tableName, columnName, columnType) => {
      const existing = db.prepare(`PRAGMA table_info(${tableName})`).all();
      const hasColumn = existing.some((column) => column.name === columnName);
      if (!hasColumn) {
        db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`).run();
      }
    };

    ensureColumn('sales', 'customer_name', 'TEXT');
    ensureColumn('sales', 'customer_nit', 'TEXT');
    ensureColumn('sales', 'customer_email', 'TEXT');
    ensureColumn('sales', 'customer_phone', 'TEXT');
    ensureColumn('sales', 'customer_address', 'TEXT');
    ensureColumn('sales', 'document_type', 'TEXT');
    ensureColumn('sales', 'customer_id', 'INTEGER');

    ensureColumn('invoices', 'customer_name', 'TEXT');
    ensureColumn('invoices', 'customer_nit', 'TEXT');
    ensureColumn('invoices', 'customer_email', 'TEXT');
    ensureColumn('invoices', 'document_type', 'TEXT');
    ensureColumn('invoices', 'printed', 'INTEGER DEFAULT 0');
    ensureColumn('invoices', 'profile_id', 'TEXT');
    db.prepare('CREATE TABLE IF NOT EXISTS document_profiles (id TEXT PRIMARY KEY,profile TEXT NOT NULL)').run();

    db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      product_id INTEGER,
      name TEXT,
      qty INTEGER,
      price REAL
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY,
      key TEXT UNIQUE,
      value TEXT
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT,
      supplier_nit TEXT,
      fecha TEXT,
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT,
      category TEXT,
      fecha TEXT,
      amount REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      product_id INTEGER,
      expected_qty INTEGER DEFAULT 0,
      counted_qty INTEGER DEFAULT 0,
      difference INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS monthly_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_year INTEGER,
      period_month INTEGER,
      sales_total REAL DEFAULT 0,
      purchases_total REAL DEFAULT 0,
      expenses_total REAL DEFAULT 0,
      iva_debito REAL DEFAULT 0,
      iva_credito REAL DEFAULT 0,
      inventory_total REAL DEFAULT 0,
      status TEXT DEFAULT 'closed',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS vat_book_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      tipo_receptor TEXT,
      numero TEXT,
      cliente_nombre TEXT,
      cliente_nit TEXT,
      base_imponible REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    const defaultSettings = {
      company_name: 'POS Control',
      company_legal_name: 'Mi Empresa S.A. de C.V.',
      company_nit: '',
      company_giro: 'Comercialización de productos y servicios',
      company_address: '',
      company_department: 'San Salvador',
      company_municipality: 'San Salvador',
      company_phone: '',
      company_email: '',
      company_logo: '',
      company_website: '',
      hacienda_env: 'sandbox',
      hacienda_url: '',
      hacienda_user: '',
      hacienda_password: '',
      hacienda_token: '',
      hacienda_certificate_path: '',
      hacienda_certificate_password: '',
      invoice_prefix: 'FE',
      invoice_serie: '001',
      invoice_next_number: '1',
      invoice_email_enabled: 'false',
      smtp_host: '',
      smtp_port: '587',
      smtp_secure: 'false',
      smtp_user: '',
      smtp_password: '',
      smtp_from: '',
      smtp_from_name: 'Mi Empresa',
      report_currency: 'USD',
      company_footer_text: 'Gracias por su compra',
      hacienda_mode: 'sandbox',
      business_active: 'false',
      iva_rate: '0.13'
    };

    Object.entries({...defaultSettings,...require('./business-config').defaults}).forEach(([key, value]) => {
      db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(key, String(value));
    });


    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, delta INTEGER NOT NULL, balance INTEGER NOT NULL, reason TEXT NOT NULL, user_id INTEGER, created_at TEXT NOT NULL)`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS inventory_movements_product ON inventory_movements(product_id,id)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS sales_created_at ON sales(created_at)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS sale_items_sale ON sale_items(sale_id)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id)').run();
    for(const [name,type] of Object.entries({code:"TEXT NOT NULL DEFAULT ''",cost:'REAL NOT NULL DEFAULT 0',min_stock:'REAL NOT NULL DEFAULT 0',unit:"TEXT NOT NULL DEFAULT 'unidad'",type:"TEXT NOT NULL DEFAULT 'producto'",version:'INTEGER NOT NULL DEFAULT 0'})) ensureColumn('products',name,type);
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS product_code_unique ON products(lower(code)) WHERE code<>''").run();
    db.prepare('CREATE TABLE IF NOT EXISTS inventory_categories (name TEXT PRIMARY KEY COLLATE NOCASE)').run();
    db.prepare('INSERT OR IGNORE INTO inventory_categories(name) SELECT DISTINCT category FROM products WHERE category IS NOT NULL').run();
    for(const [name,type] of Object.entries({discount:'REAL NOT NULL DEFAULT 0',discount_percent:'REAL NOT NULL DEFAULT 0',discount_reason:"TEXT DEFAULT ''",gross:'REAL',quote_id:'INTEGER',customer_department:"TEXT DEFAULT ''",customer_municipality:"TEXT DEFAULT ''",customer_giro:"TEXT DEFAULT ''"}))ensureColumn('sales',name,type);
    for(const [name,type] of Object.entries({cost:'REAL',unit:"TEXT DEFAULT 'unidad'",catalog_price:'REAL',price_reason:"TEXT DEFAULT ''"}))ensureColumn('sale_items',name,type);
    for(const name of ['department','municipality','giro'])ensureColumn('customers',name,"TEXT DEFAULT ''");
    db.prepare(`CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, valid_until TEXT NOT NULL, snapshot TEXT NOT NULL, converted_sale_id INTEGER)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS operation_requests (request_key TEXT PRIMARY KEY,user_id INTEGER NOT NULL,kind TEXT NOT NULL,fingerprint TEXT NOT NULL,result_id INTEGER NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,qty REAL NOT NULL,cost REAL NOT NULL,supplier TEXT,reference TEXT,notes TEXT,user_id INTEGER,created_at TEXT NOT NULL)`).run();
    ensureColumn('orders', 'updated_by', 'TEXT');
    ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('users', 'active', 'INTEGER NOT NULL DEFAULT 1');
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS sale_requests (request_key TEXT PRIMARY KEY, user_id INTEGER NOT NULL, fingerprint TEXT NOT NULL, sale_id INTEGER NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, opened_by INTEGER, closed_by INTEGER, opened_at TEXT, closed_at TEXT, opening_cents INTEGER NOT NULL, observed_cents INTEGER)`).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts((1)) WHERE closed_at IS NULL`).run();
    ensureColumn('sales', 'shift_id', 'INTEGER');
    db.prepare(`CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS restaurant_tables (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'libre', waiter TEXT DEFAULT '', customer TEXT DEFAULT '', notes TEXT DEFAULT '')`).run();
    db.prepare("INSERT OR IGNORE INTO rooms (id,name) VALUES ('salon-principal','Salón principal')").run();
    if (!db.prepare('SELECT id FROM restaurant_tables LIMIT 1').get()) {
      for(let i=1;i<=10;i++) db.prepare('INSERT INTO restaurant_tables (room,name) VALUES (?,?)').run('salon-principal',`Mesa ${i}`);
    }
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    if (userCount === 0) {
      const pin = adminPin;
      if (!/^\d{6,12}$/.test(pin)) throw new Error('Primera ejecución: define POS_ADMIN_PIN con 6 a 12 dígitos.');
      db.prepare('INSERT INTO users (name, role, pin) VALUES (?,?,?)').run(adminName, 'admin', bcrypt.hashSync(pin, 12));
    } else {
      const users = db.prepare('SELECT id, pin FROM users').all();
      users.forEach((u) => {
        const pin = u.pin || '';
        const looksHashed = /^\$2[aby]\$/.test(pin);
        if (!looksHashed && pin.length > 0) {
          const hashed = bcrypt.hashSync(pin, 10);
          db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashed, u.id);
        }
      });
    }


  })();
  return db;
}
module.exports = initializeDatabase();

module.exports.open = initializeDatabase;
