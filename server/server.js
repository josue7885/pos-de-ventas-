const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { create } = require('xmlbuilder2');
const dbPromise = require('./db');
let db;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.POS_DATA_DIR || __dirname);
const allowedOrigins = (process.env.POS_ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ credentials: true, origin(origin, done) { done(null, !origin || allowedOrigins.includes(origin)); } }));
app.disable('x-powered-by');
app.use(bodyParser.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' " + allowedOrigins.join(' ') + "; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}` && !allowedOrigins.includes(req.headers.origin)) return res.status(403).json({ error: 'Origen no permitido' });
  next();
});
const publicFiles = ['index.html','style.css','app.js','app_utils.js','app_exec_pin.js','customer-display.html','kitchen-display.html','display.js','manifest.webmanifest','icon.svg'];
app.get('/', (req,res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));
for (const file of publicFiles) app.get('/' + file, (req,res) => res.sendFile(path.join(ROOT_DIR, file)));
const PORT = Number(process.env.PORT || 3000);
const secretPath = path.join(DATA_DIR, 'jwt.key');
if (!process.env.JWT_SECRET && !fs.existsSync(secretPath)) fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('hex'), { mode: 0o600, flag: 'wx' });
const JWT_SECRET = process.env.JWT_SECRET || fs.readFileSync(secretPath, 'utf8').trim();
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
const INVOICES_DIR = path.join(DATA_DIR, 'invoices');
fs.mkdirSync(INVOICES_DIR, { recursive: true, mode: 0o700 });
app.get('/api/health', (req,res) => res.json({ service: 'pos-control', ready: Boolean(db) }));
app.use('/api', (req,res,next) => {
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method === 'GET' && ['/settings','/users','/health'].includes(req.path)) || (req.method === 'POST' && req.path === '/auth/login')) return next();
  authenticateRequired(req,res,() => {
    const role = req.user.role;
    const cash = ['admin','gerente','cajero'].includes(role);
    const finance = ['admin','gerente','contador'].includes(role);
    const orders = ['admin','gerente','cajero','mesero','cocina'].includes(role);
    if ((/^\/(sales|shifts)(\/|$)/.test(req.path) && !cash) || (/^\/invoices/.test(req.path) && !cash && !finance) || (/^\/(reports|purchases|expenses|vat-book|admin)(\/|$)/.test(req.path) && !finance) || (/^\/orders/.test(req.path) && !orders)) return res.status(403).json({ error: 'Permiso insuficiente' });
    next();
  });
});

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function validMoney(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000; }
function validAmounts(base, tax, total) {
  return [base,tax,total].every(validMoney) && Math.round(base*100)+Math.round(tax*100) === Math.round(total*100);
}
app.use('/api', (req,res,next) => {
  for (const key of ['start','end']) if (req.query[key] !== undefined && !validDate(req.query[key])) return res.status(400).json({error:'Fecha inválida'});
  if (req.query.start && req.query.end && req.query.start > req.query.end) return res.status(400).json({error:'Rango de fechas inválido'});
  if (req.query.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) return res.status(400).json({error:'Mes inválido'});
  next();
});
function ensureOpenPeriod(date) {
  const [year,month] = date.slice(0,10).split('-').map(Number);
  if (db.prepare("SELECT id FROM monthly_closures WHERE period_year=? AND period_month=? AND status='closed'").get(year,month))
    throw Object.assign(new Error('El período está cerrado.'), {status:409});
}

// Rate limiter for auth endpoints
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const execLimiter = rateLimit({ windowMs:60*1000, max:10, keyGenerator:req=>String(req.user?.id || req.ip) });
const SETTINGS_KEYS = [
  'company_name', 'company_legal_name', 'company_nit', 'company_giro', 'company_address', 'company_department', 'company_municipality',
  'company_phone', 'company_email', 'company_website', 'company_logo', 'server_base', 'hacienda_env', 'hacienda_url', 'hacienda_user', 'hacienda_password',
  'hacienda_token', 'hacienda_certificate_path', 'hacienda_certificate_password', 'invoice_prefix', 'invoice_serie', 'invoice_next_number',
  'invoice_email_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_from_name',
  'hacienda_mode', 'business_active', 'iva_rate'
];

function readSettings() {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function buildCompanyProfile() {
  const settings = readSettings();
  return {
    company_name: settings.company_name || 'POS Control',
    company_legal_name: settings.company_legal_name || '',
    company_nit: settings.company_nit || '',
    company_giro: settings.company_giro || '',
    company_address: settings.company_address || '',
    company_department: settings.company_department || '',
    company_municipality: settings.company_municipality || '',
    company_phone: settings.company_phone || '',
    company_email: settings.company_email || '',
    company_website: settings.company_website || '',
    company_logo: settings.company_logo || '',
    executive_pin_set: !!settings.executive_pin_hash,
    hacienda_env: settings.hacienda_env || 'sandbox',
    hacienda_mode: settings.hacienda_mode || 'sandbox',
    business_active: false,
    iva_rate: Number(settings.iva_rate ?? 0.13),
    hacienda_url: settings.hacienda_url || '',
    hacienda_user: settings.hacienda_user || '',
    hacienda_password: settings.hacienda_password || '',
    hacienda_token: settings.hacienda_token || '',
    hacienda_certificate_path: settings.hacienda_certificate_path || '',
    hacienda_certificate_password: settings.hacienda_certificate_password || '',
    invoice_prefix: settings.invoice_prefix || 'FE',
    invoice_serie: settings.invoice_serie || '001',
    invoice_next_number: settings.invoice_next_number || '1',
    invoice_email_enabled: settings.invoice_email_enabled === 'true',
    smtp_host: settings.smtp_host || '',
    smtp_port: Number(settings.smtp_port || 587),
    smtp_secure: settings.smtp_secure === 'true',
    smtp_user: settings.smtp_user || '',
    smtp_password: settings.smtp_password || '',
    smtp_from: settings.smtp_from || settings.company_email || '',
    smtp_from_name: settings.smtp_from_name || settings.company_name || 'Mi Empresa'
  };
}

function determineInvoiceType(customer) {
  const nit = String(customer && customer.nit ? customer.nit : '').trim();
  if (!nit || nit.toUpperCase() === 'CF' || nit.toUpperCase() === 'CONSUMIDOR FINAL') return 'consumidor_final';
  return 'credito_fiscal';
}

function addVatBookEntry(invoice) {
  const tipoReceptor = invoice && invoice.tipo_receptor ? invoice.tipo_receptor : determineInvoiceType(invoice && invoice.customer ? invoice.customer : {});
  const safeBase = Number(invoice.subtotal || 0);
  const safeIva = Number(invoice.tax || 0);
  const total = Number(invoice.total || (safeBase + safeIva));
  if (!invoice || !invoice.number) return;

  db.prepare(`INSERT INTO vat_book_entries (fecha, tipo_receptor, numero, cliente_nombre, cliente_nit, base_imponible, iva, total)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
   .run(
     new Date(invoice.createdAt || Date.now()).toISOString().slice(0, 10),
     tipoReceptor,
     invoice.number,
     invoice.customerName || 'Cliente',
     invoice.customerNit || '',
     safeBase,
     safeIva,
     total
   );
}

function buildPdfHeader(doc, title, periodStart, periodEnd) {
  const settings = buildCompanyProfile();
  if (settings.company_logo && String(settings.company_logo).startsWith('data:')) {
   try {
     const parts = String(settings.company_logo).split(',');
     const imgBuf = Buffer.from(parts[1] || '', 'base64');
     doc.image(imgBuf, { fit: [120, 80] });
   } catch (error) {
     console.warn('No se pudo renderizar el logo en el PDF del reporte:', error.message);
   }
  }

  doc.fontSize(16).text(settings.company_legal_name || settings.company_name || 'Mi Empresa', { align: 'left' });
  doc.fontSize(10).text(`NIT: ${settings.company_nit || 'N/A'} | Tel: ${settings.company_phone || 'N/A'}`);
  doc.moveDown();
  doc.fontSize(18).text(title, { align: 'center' });
  doc.fontSize(10).text(`Período: ${periodStart || 'N/A'} al ${periodEnd || 'N/A'}`, { align: 'center' });
  doc.moveDown();
}

function ensureDateRange(startValue, endValue, fallbackMonth) {
  const today = new Date();
  const monthStart = fallbackMonth || `${today.toISOString().slice(0, 7)}-01`;
  const defaultEnd = `${today.toISOString().slice(0, 10)}`;
  return {
   start: startValue || monthStart,
   end: endValue || defaultEnd
  };
}

function requireAdmin(req, res) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' });
    return false;
  }
  return true;
}

function requireAdminOrManager(req, res) {
  if (!req.user || !['admin', 'gerente'].includes(req.user.role)) {
    res.status(403).json({ error: 'Solo el administrador o gerente puede realizar esta acción' });
    return false;
  }
  return true;
}

// Verify executive PIN if configured. Expects plaintext PIN in header 'x-exec-pin'. If no executive PIN is configured, allows the request.
function requireExecutivePin(req, res) {
  try {
    const settings = readSettings();
    const stored = settings.executive_pin_hash;
    if (!stored) return true; // not configured, allow

    // Accept header 'x-exec-pin' or 'X-Executive-PIN'
    const header = req.headers['x-exec-pin'] || req.headers['X-Executive-PIN'] || req.headers['x-Executive-PIN'];
    if (!header) {
      res.status(403).json({ error: 'Se requiere PIN ejecutivo en cabecera x-exec-pin' });
      return false;
    }
    // compute sha256 hex
    const providedHash = crypto.createHash('sha256').update(String(header).trim()).digest('hex');
    if (!(String(stored).startsWith('$2') ? bcrypt.compareSync(String(header).trim(), stored) : providedHash === String(stored).trim())) {
      res.status(403).json({ error: 'PIN ejecutivo inválido' });
      return false;
    }
    return true;
  } catch (e) {
    console.error('requireExecutivePin error', e);
    res.status(500).json({ error: 'Error verificando PIN ejecutivo' });
    return false;
  }
}

function generateToken(user) {
  const sid = crypto.randomUUID();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)').run(sid,user.id,Date.now()+8*60*60*1000);
  return jwt.sign({ id:user.id, version:user.token_version, sid }, JWT_SECRET, { expiresIn:'8h', algorithm:'HS256' });
}
function safeSettings(user) {
  const settings = buildCompanyProfile();
  for (const key of ['hacienda_password','hacienda_token','hacienda_certificate_password','smtp_password']) delete settings[key];
  if (!user || !['admin','gerente'].includes(user.role)) return { company_name:settings.company_name, company_logo:settings.company_logo, iva_rate:settings.iva_rate, executive_pin_set:settings.executive_pin_set };
  return settings;
}

function nextInvoiceData() {
  const settings = buildCompanyProfile();
  const prefix = String(settings.invoice_prefix || 'FE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'FE';
  const series = String(settings.invoice_serie || '001').padStart(3, '0');
  let current = Number(settings.invoice_next_number || 1);
  if(!Number.isSafeInteger(current) || current<1) throw Object.assign(new Error('Correlativo inválido'),{status:400});
  while(db.prepare('SELECT id FROM invoices WHERE number=?').get(`${prefix}-${series}-${String(current).padStart(6,'0')}`)) current++;
  const number = `${prefix}-${series}-${String(current).padStart(6, '0')}`;
  const next = current + 1;
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('invoice_next_number', String(next));
  return { number, nextNumber: next };
}

function authenticateOptional(req,res,next) {
  if (!req.headers.authorization && !/(?:^|;\s*)pos_session=/.test(req.headers.cookie || '')) return next();
  return authenticateRequired(req,res,next);
}
function authenticateRequired(req,res,next) {
  try {
    const bearer = /^Bearer ([^ ]+)$/.exec(req.headers.authorization || '');
    const cookie = /(?:^|;\s*)pos_session=([^;]+)/.exec(req.headers.cookie || '');
    const token = bearer ? bearer[1] : cookie && cookie[1];
    if (!token) return res.status(401).json({ error:'Inicia sesión para continuar.' });
    const payload = jwt.verify(token,JWT_SECRET,{ algorithms:['HS256'] });
    const user = db.prepare('SELECT id,name,role,token_version FROM users WHERE id=?').get(payload.id);
    const session = db.prepare('SELECT id FROM sessions WHERE id=? AND user_id=? AND expires_at>?').get(payload.sid,payload.id,Date.now());
    if (!user || !session || user.token_version !== payload.version) return res.status(401).json({ error:'Sesión vencida. Inicia sesión nuevamente.' });
    req.user = { id:user.id,name:user.name,role:user.role };
    req.sessionId = payload.sid;
    return next();
  } catch (_) { return res.status(401).json({ error:'Sesión inválida.' }); }
}
app.post('/api/auth/logout', (req,res) => {
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.sessionId);
  res.clearCookie('pos_session', { path:'/api' });
  res.json({ success:true });
});
app.post('/api/auth/executive-pin', execLimiter, (req,res) => {
  if (!requireAdmin(req,res) || !requireExecutivePin(req,res)) return;
  const pin = String(req.body.pin || '');
  if (!/^\d{6,12}$/.test(pin)) return res.status(400).json({ error:'Usa un PIN de 6 a 12 dígitos.' });
  db.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('executive_pin_hash',bcrypt.hashSync(pin,12));
  res.json({ success:true });
});

async function sendInvoiceEmail(invoiceRow, customerEmail) {
  const config = buildCompanyProfile();
  const hasSmtpConfig = config.smtp_host && config.smtp_user && config.smtp_password;
  if (!config.invoice_email_enabled || !hasSmtpConfig) {
    return { sent: false, reason: 'Configuración SMTP no activada o incompleta.' };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: Number(config.smtp_port || 587),
    secure: !!config.smtp_secure,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_password
    }
  });

  const sale=db.prepare('SELECT * FROM sales WHERE id=?').get(invoiceRow.sale_id);
  if(!sale) return {sent:false,reason:'Venta no encontrada'};
  sale.items=db.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id').all(sale.id);
  const pdf=await require('./receipt').receiptBuffer(config,invoiceRow,sale);
  let info;
  try {
    info=await transporter.sendMail({
      from:{name:config.smtp_from_name,address:config.smtp_from || config.smtp_user},
      to:customerEmail,
      subject:`Comprobante interno ${invoiceRow.number}`,
      text:`Adjuntamos el comprobante ${invoiceRow.number} de ${config.company_name}. Sin autorización fiscal.`,
      attachments:[{filename:'comprobante.pdf',content:pdf,contentType:'application/pdf'}]
    });
  } finally { transporter.close(); }

  return { sent: true, messageId: info.messageId };
}

app.get('/api/settings', authenticateOptional, (req, res) => {
  res.json({ settings: safeSettings(req.user) });
});

app.put('/api/settings', execLimiter, authenticateRequired, (req, res) => {
  if (!requireAdmin(req, res)) return;
  // Require executive PIN in addition to role if it's configured
  if (!requireExecutivePin(req, res)) return;

  const incoming = req.body || {};
  if(incoming.business_active === true || incoming.business_active === 'true') return res.status(501).json({error:'No se puede activar facturación fiscal: el conector no está implementado.'});
  const keys = Object.keys(incoming).filter((key) => SETTINGS_KEYS.includes(key));
  if (keys.length === 0) return res.status(400).json({ error: 'No hay campos válidos para actualizar' });

  if(incoming.invoice_next_number !== undefined && (!Number.isSafeInteger(Number(incoming.invoice_next_number)) || Number(incoming.invoice_next_number)<1)) return res.status(400).json({error:'Correlativo inválido'});
  if(incoming.invoice_serie !== undefined && !/^[A-Za-z0-9-]{1,20}$/.test(String(incoming.invoice_serie))) return res.status(400).json({error:'Serie inválida'});
  const upsert = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (incoming.iva_rate !== undefined && (!Number.isFinite(Number(incoming.iva_rate)) || Number(incoming.iva_rate)<0 || Number(incoming.iva_rate)>1)) return res.status(400).json({error:'Tasa inválida'});
  db.transaction(() => keys.forEach((key) => {
    if (['hacienda_password','hacienda_token','hacienda_certificate_password','smtp_password'].includes(key) && !incoming[key]) return;
    upsert.run(key, String(incoming[key] ?? ''));
  }))();

  res.json({ settings: safeSettings(req.user) });
});

// Auth (PIN-based) - now returns JWT
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { pin, id } = req.body;
  if (!Number.isSafeInteger(Number(id)) || !/^\d{4,12}$/.test(String(pin || ''))) return res.status(400).json({ error: 'Empleado y PIN requeridos' });

  let user;
  if (id) {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else {
    // find user by matching hashed PIN
    const all = db.prepare('SELECT * FROM users').all();
    user = all.find((u) => bcrypt.compareSync(String(pin).trim(), u.pin));
  }

  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  // if id login, verify pin
  if (id && !bcrypt.compareSync(String(pin).trim(), user.pin)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = generateToken(user);
  res.cookie('pos_session',token,{ httpOnly:true, sameSite:'strict', secure:req.secure, path:'/api', maxAge:8*60*60*1000 });
  res.json({ user: { id: user.id, name: user.name, role: user.role }, token });
});

app.get('/api/products', authenticateOptional, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id').all();
  res.json({ products: rows });
});

// Users management endpoints
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name, role FROM users ORDER BY id').all();
  res.json({ users });
});

app.get('/api/users/:id', authenticateOptional, (req, res) => {
  const id = req.params.id;
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user });
});

app.get('/api/customers', authenticateOptional, (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY full_name ASC, id DESC').all();
  res.json({ customers: rows });
});

app.get('/api/customers/:id', authenticateOptional, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ customer: row });
});

app.post('/api/customers', authenticateOptional, (req, res) => {
  const payload = req.body || {};
  const fullName = String(payload.full_name || payload.name || '').trim();
  const nit = String(payload.nit || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Nombre del cliente requerido' });

  const insert = db.prepare(`INSERT INTO customers (full_name, nit, dui, email, phone, address, document_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = insert.run(fullName, nit || '', payload.dui || '', payload.email || '', payload.phone || '', payload.address || '', payload.document_type || determineInvoiceType({ nit }), payload.notes || '');
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  res.json({ customer });
});

app.put('/api/customers/:id', authenticateOptional, (req, res) => {
  const payload = req.body || {};
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

  db.prepare(`UPDATE customers SET full_name = ?, nit = ?, dui = ?, email = ?, phone = ?, address = ?, document_type = ?, notes = ? WHERE id = ?`)
    .run(
      String(payload.full_name || payload.name || existing.full_name || '').trim(),
      String(payload.nit || existing.nit || '').trim(),
      payload.dui || existing.dui || '',
      payload.email || existing.email || '',
      payload.phone || existing.phone || '',
      payload.address || existing.address || '',
      payload.document_type || existing.document_type || determineInvoiceType({ nit: payload.nit || existing.nit || '' }),
      payload.notes || existing.notes || '',
      req.params.id
    );

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json({ customer });
});

app.post('/api/users', execLimiter, authenticateRequired, (req, res) => {
  if (!requireAdminOrManager(req, res)) return;
  // Require executive PIN if configured
  if (!requireExecutivePin(req, res)) return;

  const { name, role, pin } = req.body;
  if (!name || !role || !pin) return res.status(400).json({ error: 'name, role y pin son requeridos' });
  if (!['admin','gerente','cajero','mesero','cocina','contador'].includes(role) || !/^\d{6,12}$/.test(String(pin)) || (req.user.role !== 'admin' && ['admin','gerente'].includes(role))) return res.status(400).json({error:'Rol o PIN inválido'});
  const hashed = bcrypt.hashSync(String(pin).trim(), 12);
  const stmt = db.prepare('INSERT INTO users (name, role, pin) VALUES (?,?,?)');
  const info = stmt.run(name, role, hashed);
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ user });
});

app.put('/api/users/:id', execLimiter, authenticateRequired, (req, res) => {
  if (!requireAdminOrManager(req, res)) return;
  // Require executive PIN if configured
  if (!requireExecutivePin(req, res)) return;

  const id = req.params.id;
  const { name, role, pin } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });
  if ((role && !['admin','gerente','cajero','mesero','cocina','contador'].includes(role)) || (pin && !/^\d{6,12}$/.test(String(pin))) || (req.user.role !== 'admin' && ([existing.role,role].some(r => ['admin','gerente'].includes(r))))) return res.status(400).json({error:'Rol o PIN inválido'});
  if (existing.role === 'admin' && role && role !== 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n <= 1) return res.status(409).json({error:'Debe quedar un administrador'});
  const newPin = pin ? bcrypt.hashSync(String(pin).trim(), 10) : existing.pin;
  const stmt = db.prepare('UPDATE users SET name = ?, role = ?, pin = ?, token_version = token_version + 1 WHERE id = ?');
  stmt.run(name || existing.name, role || existing.role, newPin, id);
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(id);
  res.json({ user });
});

app.delete('/api/users/:id', execLimiter, authenticateRequired, (req, res) => {
  if (!requireAdminOrManager(req, res)) return;
  // Require executive PIN if configured
  if (!requireExecutivePin(req, res)) return;

  const id = req.params.id;
  const target = db.prepare('SELECT role FROM users WHERE id=?').get(id);
  if (!target) return res.status(404).json({error:'Usuario no encontrado'});
  if (Number(id) === req.user.id || (req.user.role !== 'admin' && ['admin','gerente'].includes(target.role)) || (target.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n <= 1)) return res.status(409).json({error:'No puedes eliminar esta cuenta'});
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(id);
  res.json({ success: true });
});

require('./core')(app, () => db, { profile:buildCompanyProfile, nextInvoiceData, addVatBookEntry, requireAdminOrManager });

app.get('/api/purchases', authenticateRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM purchases ORDER BY fecha DESC, id DESC').all();
  res.json({ purchases: rows });
});

app.post('/api/purchases', authenticateRequired, (req, res) => {
  if (!requireAdminOrManager(req, res)) return;
  const { supplier_name, supplier_nit, fecha, subtotal, iva, total, notes } = req.body || {};
  if (!validDate(fecha) || !validAmounts(subtotal,iva,total)) return res.status(400).json({error:'Fecha o importes inválidos; total debe ser subtotal más IVA.'});
  ensureOpenPeriod(fecha);
  const insert = db.prepare('INSERT INTO purchases (supplier_name, supplier_nit, fecha, subtotal, iva, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = insert.run(supplier_name || '', supplier_nit || '', fecha, Number(subtotal || 0), Number(iva || 0), Number(total || 0), notes || '');
  const row = db.prepare('SELECT * FROM purchases WHERE id = ?').get(info.lastInsertRowid);
  res.json({ purchase: row });
});

app.get('/api/expenses', authenticateRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY fecha DESC, id DESC').all();
  res.json({ expenses: rows });
});

app.post('/api/expenses', authenticateRequired, (req, res) => {
  if (!requireAdminOrManager(req, res)) return;
  const { description, category, fecha, amount, iva, total, notes } = req.body || {};
  if (!String(description || '').trim() || !validDate(fecha) || !validAmounts(amount,iva,total)) return res.status(400).json({error:'Descripción, fecha o importes inválidos.'});
  ensureOpenPeriod(fecha);
  const insert = db.prepare('INSERT INTO expenses (description, category, fecha, amount, iva, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = insert.run(description, category || 'General', fecha, Number(amount || 0), Number(iva || 0), Number(total || 0), notes || '');
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  res.json({ expense: row });
});

app.post('/api/inventory/check', authenticateRequired, (req, res) => {
  if (!requireAdminOrManager(req, res)) return;
  const { product_id, fecha, expected_qty, counted_qty, notes, adjustStock } = req.body || {};
  if (!validDate(fecha) || !Number.isSafeInteger(counted_qty) || counted_qty<0 || counted_qty>10000000 || !Number.isSafeInteger(expected_qty)) return res.status(400).json({error:'Fecha o cantidades inválidas'});
  const check = db.transaction(() => {
    const product=db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
    if(!product) throw Object.assign(new Error('Producto no encontrado'),{status:404});
    if(product.stock !== expected_qty) throw Object.assign(new Error('El inventario cambió. Actualiza antes del conteo.'),{status:409});
    const difference=counted_qty-product.stock;
    const info=db.prepare('INSERT INTO inventory_checks (fecha,product_id,expected_qty,counted_qty,difference,notes) VALUES (?,?,?,?,?,?)').run(fecha,product_id,product.stock,counted_qty,difference,String(notes || ''));
    if(adjustStock === true) {
      if(!String(notes || '').trim()) throw Object.assign(new Error('Indica el motivo del ajuste.'),{status:400});
      db.prepare('UPDATE products SET stock=? WHERE id=?').run(counted_qty,product_id);
      db.prepare('INSERT INTO inventory_movements (product_id,delta,balance,reason,user_id,created_at) VALUES (?,?,?,?,?,?)').run(product_id,difference,counted_qty,'Conteo: '+notes,req.user.id,new Date().toISOString());
    }
    return db.prepare('SELECT * FROM inventory_checks WHERE id=?').get(info.lastInsertRowid);
  })();
  res.json({check, adjusted:adjustStock === true});
});

app.get('/api/admin/monthly-summary', authenticateRequired, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split('-').map(Number);
  const start = `${year}-${String(mon).padStart(2, '0')}-01`;
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;

  const salesTotal = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE date(created_at) >= date(?) AND date(created_at) < date(?)`).get(start, nextMonth).total || 0;
  const totalTax = db.prepare(`SELECT COALESCE(SUM(tax),0) as total FROM sales WHERE date(created_at) >= date(?) AND date(created_at) < date(?)`).get(start, nextMonth).total || 0;
  const purchasesTotal = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM purchases WHERE date(fecha) >= date(?) AND date(fecha) < date(?)`).get(start, nextMonth).total || 0;
  const expensesTotal = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM expenses WHERE date(fecha) >= date(?) AND date(fecha) < date(?)`).get(start, nextMonth).total || 0;
  const ivaCredito = db.prepare(`SELECT COALESCE(SUM(iva),0) as total FROM purchases WHERE date(fecha) >= date(?) AND date(fecha) < date(?)`).get(start, nextMonth).total || 0;
  const inventoryTotal = db.prepare(`SELECT COALESCE(SUM(price * stock),0) as total FROM products`).get().total || 0;

  const salesByDay = db.prepare(`SELECT date(created_at) as day, COALESCE(SUM(total),0) as total FROM sales WHERE date(created_at) >= date(?) AND date(created_at) < date(?) GROUP BY date(created_at) ORDER BY day ASC`).all(start, nextMonth);
  const summary = {
    month,
    salesTotal: Number(salesTotal),
    purchasesTotal: Number(purchasesTotal),
    expensesTotal: Number(expensesTotal),
    ivaDebito: Number(totalTax),
    ivaCredito: Number(ivaCredito),
    inventoryTotal: Number(inventoryTotal),
    netMonthly: Number(salesTotal - purchasesTotal - expensesTotal),
    salesByDay
  };
  res.json(summary);
});

app.post('/api/admin/close-month', authenticateRequired, (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { year, month, notes } = req.body || {};
  if (!Number.isInteger(Number(year)) || Number(year)<2000 || Number(year)>9999 || !Number.isInteger(Number(month)) || Number(month)<1 || Number(month)>12) return res.status(400).json({error:'Período inválido'});
  const period=String(year)+'-'+String(month).padStart(2,'0');
  if(period >= new Date().toISOString().slice(0,7)) return res.status(409).json({error:'Solo se pueden cerrar meses finalizados (UTC).'});
  const existing=db.prepare('SELECT * FROM monthly_closures WHERE period_year=? AND period_month=?').get(Number(year),Number(month));
  if(existing) return res.json({success:true,closure:existing,replayed:true});
  const monthValue = String(month).padStart(2, '0');
  const start = `${year}-${monthValue}-01`;
  const nextMonth = Number(month) === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, '0')}-01`;

  const salesTotal = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE date(created_at) >= date(?) AND date(created_at) < date(?)`).get(start, nextMonth).total || 0;
  const purchasesTotal = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM purchases WHERE date(fecha) >= date(?) AND date(fecha) < date(?)`).get(start, nextMonth).total || 0;
  const expensesTotal = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM expenses WHERE date(fecha) >= date(?) AND date(fecha) < date(?)`).get(start, nextMonth).total || 0;
  const ivaDebito = db.prepare(`SELECT COALESCE(SUM(tax),0) as total FROM sales WHERE date(created_at) >= date(?) AND date(created_at) < date(?)`).get(start, nextMonth).total || 0;
  const ivaCredito = db.prepare(`SELECT COALESCE(SUM(iva),0) as total FROM purchases WHERE date(fecha) >= date(?) AND date(fecha) < date(?)`).get(start, nextMonth).total || 0;
  const inventoryTotal = db.prepare(`SELECT COALESCE(SUM(price * stock),0) as total FROM products`).get().total || 0;

  const insert = db.prepare('INSERT INTO monthly_closures (period_year, period_month, sales_total, purchases_total, expenses_total, iva_debito, iva_credito, inventory_total, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const info = insert.run(Number(year), Number(month), Number(salesTotal), Number(purchasesTotal), Number(expensesTotal), Number(ivaDebito), Number(ivaCredito), Number(inventoryTotal), 'closed', notes || 'Cierre mensual generado');
  const row = db.prepare('SELECT * FROM monthly_closures WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success: true, closure: row });
});

// Activate business (production) — requires admin + executive PIN
app.post('/api/admin/activate-business', (req,res) => res.status(501).json({error:'La integración fiscal todavía no está implementada.'}));

app.get('/api/vat-book', authenticateRequired, (req, res) => {
  const start = req.query.start || new Date().toISOString().slice(0, 7) + '-01';
  const end = req.query.end || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT * FROM vat_book_entries WHERE date(fecha) BETWEEN date(?) AND date(?) ORDER BY fecha DESC, id DESC`).all(start, end);
  const totals = db.prepare(`SELECT tipo_receptor, SUM(base_imponible) as base_imponible, SUM(iva) as iva, SUM(total) as total, COUNT(*) as count FROM vat_book_entries WHERE date(fecha) BETWEEN date(?) AND date(?) GROUP BY tipo_receptor ORDER BY tipo_receptor`).all(start, end);
  res.json({ rows, totals, period: { start, end } });
});

app.get('/api/reports/monthly-close/pdf', authenticateRequired, (req, res) => {
  const range = ensureDateRange(req.query.start, req.query.end, req.query.month ? `${req.query.month}-01` : undefined);
  const monthStart = range.start;
  const monthEnd = range.end;
  const sales = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(tax),0) as tax, COUNT(*) as count FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?)`).get(monthStart, monthEnd);
  const purchases = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM purchases WHERE date(fecha) BETWEEN date(?) AND date(?)`).get(monthStart, monthEnd);
  const expenses = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM expenses WHERE date(fecha) BETWEEN date(?) AND date(?)`).get(monthStart, monthEnd);
  const inventory = db.prepare(`SELECT COUNT(*) as items, COALESCE(SUM(stock),0) as stock, COALESCE(SUM(CASE WHEN stock < 0 THEN stock ELSE 0 END),0) as negative_stock, COALESCE(SUM(CASE WHEN stock > 0 THEN stock ELSE 0 END),0) as positive_stock FROM products`).get();
  const salesByDay = db.prepare(`SELECT date(created_at) as day, COALESCE(SUM(total),0) as total FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY date(created_at) ORDER BY date(created_at) ASC`).all(monthStart, monthEnd);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="cierre-mensual.pdf"');
  doc.pipe(res);

  buildPdfHeader(doc, 'Cierre de Mes', monthStart, monthEnd);

  doc.fontSize(12).font('Helvetica-Bold').text('Resumen', { underline: true });
  doc.moveDown(0.3);
  doc.font('Helvetica');
  doc.text(`Ventas totales: ${Number(sales.total || 0).toFixed(2)}`);
  doc.text(`IVA cobrados: ${Number(sales.tax || 0).toFixed(2)}`);
  doc.text(`Compras: ${Number(purchases.total || 0).toFixed(2)}`);
  doc.text(`Gastos: ${Number(expenses.total || 0).toFixed(2)}`);
  doc.text(`Inventario (valor): ${Number(inventory.stock || 0).toFixed(2)}`);
  doc.text(`Stock positivo (unidades): ${Number(inventory.positive_stock || 0).toFixed(2)}`);
  doc.text(`Stock negativo (unidades): ${Math.abs(Number(inventory.negative_stock || 0)).toFixed(2)}`);

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Resultado neto: ', { continued: true });
  doc.font('Helvetica').text(`${(Number(sales.total || 0) - Number(purchases.total || 0) - Number(expenses.total || 0)).toFixed(2)}`);

  doc.moveDown(1);
  doc.font('Helvetica-Bold').text('Ventas por día', { underline: true });
  doc.moveDown(0.3);

  if (salesByDay && salesByDay.length) {
    salesByDay.forEach((d) => {
      doc.font('Helvetica').text(`${d.day} — ${Number(d.total || 0).toFixed(2)}`);
    });
  } else {
    doc.font('Helvetica').text('No hay ventas en este período.');
  }

  doc.end();
});

app.get('/api/reports/vat-book/pdf', authenticateRequired, (req, res) => {
  const range = ensureDateRange(req.query.start, req.query.end, undefined);
  const rows = db.prepare(`SELECT * FROM vat_book_entries WHERE date(fecha) BETWEEN date(?) AND date(?) ORDER BY fecha ASC, id ASC`).all(range.start, range.end);
  const creditoFiscal = rows.filter((row) => String(row.tipo_receptor || '').toLowerCase() === 'credito_fiscal');
  const consumidorFinal = rows.filter((row) => String(row.tipo_receptor || '').toLowerCase() === 'consumidor_final');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="libro-iva.pdf"');
  doc.pipe(res);

  buildPdfHeader(doc, 'Libro de IVA', range.start, range.end);

  const writeTable = (items, title) => {
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text(title, { underline: true });
    doc.moveDown(0.2);
    if (!items.length) {
      doc.font('Helvetica').fontSize(11).text('No hay registros.');
      return;
    }

    // Header row
    const leftX = doc.x;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Fecha', leftX, doc.y);
    doc.text('Número', leftX + 90, doc.y);
    doc.text('Cliente', leftX + 190, doc.y);
    doc.text('NIT', leftX + 360, doc.y);
    doc.text('Base', leftX + 440, doc.y, { width: 70, align: 'right' });
    doc.text('IVA', leftX + 520, doc.y, { width: 60, align: 'right' });
    doc.text('Total', leftX + 590, doc.y, { width: 70, align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica');

    items.forEach((r) => {
      doc.text(r.fecha || '', leftX, doc.y);
      doc.text(r.numero || '', leftX + 90, doc.y);
      doc.text((r.cliente_nombre || 'Cliente').slice(0, 30), leftX + 190, doc.y);
      doc.text(r.cliente_nit || 'CF', leftX + 360, doc.y);
      doc.text(Number(r.base_imponible || 0).toFixed(2), leftX + 440, doc.y, { width: 70, align: 'right' });
      doc.text(Number(r.iva || 0).toFixed(2), leftX + 520, doc.y, { width: 60, align: 'right' });
      doc.text(Number(r.total || 0).toFixed(2), leftX + 590, doc.y, { width: 70, align: 'right' });
      doc.moveDown(0.3);
      if (doc.y > doc.page.height - 100) doc.addPage();
    });

    const totalBase = items.reduce((sum, row) => sum + Number(row.base_imponible || 0), 0);
    const totalIva = items.reduce((sum, row) => sum + Number(row.iva || 0), 0);
    const totalGeneral = items.reduce((sum, row) => sum + Number(row.total || 0), 0);

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text(`Totales: Base ${totalBase.toFixed(2)}  IVA ${totalIva.toFixed(2)}  Total ${totalGeneral.toFixed(2)}`);
  };

  writeTable(creditoFiscal, 'Crédito Fiscal');
  writeTable(consumidorFinal, 'Consumidor Final');

  if (rows.length === 0) {
    doc.moveDown();
    doc.font('Helvetica').text('No hay registros de IVA en este rango.');
  }
  doc.end();
});

app.get('/api/reports/inventory/pdf', authenticateRequired, (req, res) => {
  const range = ensureDateRange(req.query.start, req.query.end, undefined);
  const products = db.prepare(`SELECT * FROM products ORDER BY name ASC`).all();
  const positives = products.filter(p => Number(p.stock || 0) >= 0);
  const negatives = products.filter(p => Number(p.stock || 0) < 0);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="inventario.pdf"');
  doc.pipe(res);

  buildPdfHeader(doc, 'Inventario', range.start, range.end);

  doc.fontSize(12).font('Helvetica-Bold').text('Existencias positivas', { underline: true });
  doc.moveDown(0.3);
  if (positives.length === 0) {
    doc.font('Helvetica').text('No hay productos con existencias positivas.');
  } else {
    positives.forEach((p) => {
      doc.font('Helvetica').fontSize(10).text(`${p.name} — Stock: ${Number(p.stock || 0)} — Precio: ${Number(p.price || 0).toFixed(2)}`);
      if (doc.y > doc.page.height - 100) doc.addPage();
    });
  }

  doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text('Existencias negativas (alerta)', { underline: true });
  doc.moveDown(0.3);
  if (negatives.length === 0) {
    doc.font('Helvetica').text('No hay existencias negativas.');
  } else {
    negatives.forEach((p) => {
      doc.fillColor('red').font('Helvetica').fontSize(10).text(`${p.name} — Stock: ${Number(p.stock || 0)} — Precio: ${Number(p.price || 0).toFixed(2)}`);
      doc.fillColor('black');
      if (doc.y > doc.page.height - 100) doc.addPage();
    });
  }

  doc.end();
});

app.get('/api/invoices/:saleId/xml', (req, res) => {
  const saleId = req.params.saleId;
  const row = db.prepare('SELECT xml FROM invoices WHERE sale_id = ?').get(saleId);
  if (!row || !row.xml) return res.status(404).send('No encontrado');
  res.set('Content-Type', 'application/xml');
  res.send(row.xml);
});

app.post('/api/invoices/:saleId/print', authenticateOptional, (req, res) => {
  const saleId = req.params.saleId;
  const row = db.prepare('SELECT * FROM invoices WHERE sale_id = ?').get(saleId);
  if (!row || !row.pdf_path) return res.status(404).json({ error: 'Factura no encontrada' });
  db.prepare('UPDATE invoices SET printed = 1 WHERE sale_id = ?').run(saleId);
  res.json({ success: true, pdf_url: `/api/invoices/${saleId}/pdf`, invoice_number: row.number });
});

// Server-Sent Events: order stream for kitchen displays and realtime updates
const sseClients = [];

app.get('/api/orders/stream', (req,res) => res.status(410).json({error:'Usa GET /api/orders para sincronizar.'}));

function broadcastOrderEvent(eventType, payload) {
  const data = JSON.stringify({ event: eventType, payload });
  sseClients.forEach((client) => {
    try {
      client.res.write(`event: orders\ndata: ${data}\n\n`);
    } catch (e) {
      // ignore write errors; cleanup on next close
    }
  });
}

app.get('/api/orders', authenticateOptional, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const orders = rows.map((order) => ({
    ...order,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id)
  }));
  res.json({ orders });
});

app.post('/api/orders', authenticateOptional, (req, res) => {
  const { tableNumber, customerName, notes } = req.body || {};
  let items = req.body?.items;
  if (!Array.isArray(items) || !items.length || items.length > 500) return res.status(400).json({error:'Orden inválida'});
  if (req.user.role === 'cocina') return res.status(403).json({error:'Permiso insuficiente'});
  items = items.map(it => { const p=db.prepare('SELECT * FROM products WHERE id=?').get(it.id); return p && Number.isSafeInteger(it.qty) && it.qty>0 ? {...p,qty:it.qty} : null; });
  if (items.some(it=>!it)) return res.status(400).json({error:'Productos inválidos'});
  const employeeName = req.user.name;
  if (!items || !items.length) return res.status(400).json({ error: 'La orden no tiene productos' });

  const tx = db.transaction(() => {
    const table = req.body.tableId ? db.prepare('SELECT * FROM restaurant_tables WHERE id=?').get(req.body.tableId) : null;
    if (req.body.tableId && (!table || !['libre','ocupada'].includes(table.status))) throw Object.assign(new Error('La mesa ya tiene un pedido'), {status:409});
    if (table) db.prepare("UPDATE restaurant_tables SET status='pedido',customer=?,waiter=? WHERE id=?").run(String(customerName || 'Cliente'),req.user.name,table.id);
    const info = db.prepare('INSERT INTO orders (employee_name, table_number, customer_name, notes, status, total, created_at) VALUES (?,?,?,?,?,?,?)').run(
      employeeName || 'Mesero',
      table ? table.name : 'MOSTRADOR',
      customerName || 'Cliente',
      notes || '',
      'pending',
      items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0),
      new Date().toISOString()
    );

    const orderId = info.lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, qty, price) VALUES (?,?,?,?,?)');
    items.forEach((item) => insertItem.run(orderId, item.id || null, item.name, Number(item.qty || 1), Number(item.price || 0)));
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  });

  try {
    const order = tx();
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
    const fullOrder = { ...order, items: orderItems };

    // Broadcast to SSE clients so kitchen screens update instantly
    try {
      broadcastOrderEvent('new_order', fullOrder);
    } catch (e) { console.warn('Broadcast new_order failed', e.message); }

    res.json({ order: fullOrder });
  } catch (error) {
    console.error('Error creando orden:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo crear la orden' });
  }
});

// Authentication and kitchen roles are enforced by the API middleware.
app.patch('/api/orders/:id/status', authenticateOptional, (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body || {};
  const allowed = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido' });

  // record who updated if we have an authenticated user
  const updater = req.user ? `${req.user.name} (id:${req.user.id})` : (req.body && req.body.updater_name) || 'kitchen';

  const current=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!current) return res.status(404).json({error:'Orden no encontrada'});
  const transitions={pending:['preparing','ready','cancelled'],preparing:['ready','cancelled'],ready:['served','cancelled'],served:[],cancelled:[]};
  if(status !== current.status && !transitions[current.status]?.includes(status)) return res.status(409).json({error:'Transición de pedido inválida. Actualiza la pantalla.'});
  const row = db.prepare('UPDATE orders SET status = ?, updated_by = ? WHERE id = ?').run(status, updater, orderId);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId);

  const fullOrder = { ...order, items };
  // broadcast status change
  try {
    broadcastOrderEvent('order_update', fullOrder);
  } catch (e) { console.warn('Broadcast order_update failed', e.message); }

  res.json({ success: true, order: fullOrder, rows: row.changes });
});

app.get('/api/reports/sales', (req,res) => {
  const {start,end,employeeId}=req.query;
  const where=[],args=[];
  if(start){where.push('date(s.created_at)>=date(?)');args.push(start);}
  if(end){where.push('date(s.created_at)<=date(?)');args.push(end);}
  if(employeeId){where.push('s.employee_name=(SELECT name FROM users WHERE id=?)');args.push(employeeId);}
  const sales=db.prepare('SELECT s.* FROM sales s'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY s.id DESC').all(...args);
  const units=sales.reduce((sum,s)=>sum+db.prepare('SELECT COALESCE(SUM(qty),0) AS n FROM sale_items WHERE sale_id=?').get(s.id).n,0);
  res.json({totalSales:sales.reduce((sum,s)=>sum+s.total,0),count:sales.length,units,sales});
});

// Export reports (CSV / XLSX)
app.get('/api/reports/sales/export', authenticateRequired, async (req, res) => {
  const { start, end, employeeId, format } = req.query;
  const where = [];
  const params = [];
  if (start) { where.push("date(s.created_at) >= date(?)"); params.push(start); }
  if (end) { where.push("date(s.created_at) <= date(?)"); params.push(end); }
  if (employeeId) { where.push('s.employee_name = (SELECT name FROM users WHERE id = ?)'); params.push(employeeId); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`SELECT s.id, s.created_at, s.employee_name, s.payment_method, s.total FROM sales s ${whereSql} ORDER BY s.created_at DESC`).all(...params);

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Fecha', key: 'created_at', width: 30 },
      { header: 'Empleado', key: 'employee_name', width: 25 },
      { header: 'Método', key: 'payment_method', width: 15 },
      { header: 'Total', key: 'total', width: 12 }
    ];
    rows.forEach(r => sheet.addRow(r));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
    return;
  }

  // Default CSV
  let csv = 'ID,Fecha,Empleado,Pago,Total\n';
  rows.forEach(r => {
    csv += [r.id,r.created_at,r.employee_name,r.payment_method,r.total].map(value => { let text=String(value ?? ''); if(/^[=+@\-\t\r]/.test(text)) text="'"+text; return '"'+text.replace(/"/g,'""')+'"'; }).join(',')+'\n';
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ventas.csv"');
  res.send(csv);
});

app.post('/api/invoices/:saleId/email', rateLimit({windowMs:60000,max:5}), authenticateRequired, async (req, res) => {
  const saleId = req.params.saleId;
  const { customerEmail } = req.body || {};
  if (typeof customerEmail !== 'string' || customerEmail.length>254 || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(customerEmail)) return res.status(400).json({error:'Indica un único correo válido para el cliente'});

  const invoice = db.prepare('SELECT * FROM invoices WHERE sale_id = ?').get(saleId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  try {
    const sent = await sendInvoiceEmail(invoice, customerEmail);
    if (!sent.sent) {
      return res.status(400).json({ error: sent.reason || 'No se pudo enviar el correo' });
    }
    return res.json({ success: true, message: 'Correo enviado correctamente.' });
  } catch (error) {
    console.error('Error enviando correo:', error);
    return res.status(500).json({ error: 'No se pudo enviar el correo. Revisa la configuración SMTP.' });
  }
});

app.post('/api/hacienda/send/:invoiceId', (req,res) => res.status(501).json({error:'La integración fiscal todavía no está implementada.'}));
app.use((error,req,res,next) => {
  console.error(error.message);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error:error.status ? error.message : 'Error del servidor. No se confirmó la operación.' });
});
let httpServer;
dbPromise.then(resolved => {
  db=resolved;
  httpServer=app.listen(PORT, process.env.POS_HOST || '127.0.0.1', () => console.log(`POS server listening on port ${httpServer.address().port}`));
  httpServer.on('error', error => { console.error(error.message); process.exit(1); });
}).catch(error => { console.error('Error inicializando base de datos:',error.message); process.exit(1); });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { if (httpServer) httpServer.close(); process.exit(0); });
