const {sendSaleReceipt}=require('./document-mail');
const crypto = require('crypto');
const {receiptDocument}=require('./receipt');
const {loadDocument,captureProfile,documentFilename}=require('./documents');
const { create } = require('xmlbuilder2');
const commerce=require('./commerce');

module.exports = function registerCore(app, getDb, { profile, nextInvoiceData, addVatBookEntry, requireAdminOrManager,safeSettings }) {
  const db = () => getDb();
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const cents = (value, label = 'Monto') => {
    const n = Number(value);
    if (value === null || value === '' || !Number.isFinite(n) || n < 0 || n > 1000000) fail(400, `${label} inválido`);
    return Math.round((n + Number.EPSILON) * 100);
  };
  const handle = fn => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };
  function movement(productId, delta, balance, reason, userId) {
    db().prepare('INSERT INTO inventory_movements (product_id,delta,balance,reason,user_id,created_at) VALUES (?,?,?,?,?,?)').run(productId,delta,balance,reason,userId,new Date().toISOString());
  }
  app.get('/api/inventory/movements', handle((req,res)=>{
    if(!requireAdminOrManager(req,res))return;
    res.json({movements:db().prepare('SELECT m.*,p.name AS product_name,u.name AS employee_name FROM inventory_movements m LEFT JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 1000').all()});
  }));
  const itemsFor = (table, column, id) => db().prepare(`SELECT * FROM ${table} WHERE ${column} = ? ORDER BY id`).all(id);
  const saleFor = id => ({ ...db().prepare('SELECT s.*,i.number AS invoice_number FROM sales s LEFT JOIN invoices i ON i.sale_id=s.id WHERE s.id = ?').get(id), items: itemsFor('sale_items', 'sale_id', id) });
  function shiftState() {
    const shift = db().prepare('SELECT * FROM shifts ORDER BY id DESC LIMIT 1').get();
    if (!shift) return { isOpen: false, openingCash: 0, currentCash: 0, cashSales: 0, cardSales: 0, transferSales: 0 };
    const totals = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    for (const row of db().prepare('SELECT payment_method, total FROM sales WHERE shift_id = ?').all(shift.id)) {
      totals[row.payment_method] = (totals[row.payment_method] || 0) + Math.round(row.total * 100);
    }
    return { id: shift.id, isOpen: !shift.closed_at, openingCash: shift.opening_cents / 100,
      currentCash: (shift.opening_cents + totals.efectivo) / 100, cashSales: totals.efectivo / 100,
      cardSales: totals.tarjeta / 100, transferSales: totals.transferencia / 100,
      openedAt: shift.opened_at, closedAt: shift.closed_at, observedCash: (shift.observed_cents || 0) / 100 };
  }
  app.get('/api/sync', handle((req, res) => {
    const financial = ['admin', 'gerente', 'cajero', 'contador'].includes(req.user.role);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ settings:safeSettings(req.user),businessId:req.businessId,categories:db().prepare('SELECT name FROM inventory_categories ORDER BY name').all().map(r=>r.name), products: db().prepare('SELECT * FROM products ORDER BY id').all(),
      sales: financial ? db().prepare('SELECT id FROM sales ORDER BY id DESC').all().map(r => saleFor(r.id)) : [],
      shift: financial ? shiftState() : { isOpen: false },
      orders: db().prepare('SELECT * FROM orders ORDER BY id DESC').all().map(o => ({ ...o, items: itemsFor('order_items', 'order_id', o.id) })),
      rooms:db().prepare('SELECT * FROM rooms ORDER BY id').all(), tables:db().prepare('SELECT * FROM restaurant_tables ORDER BY id').all(),
      user: req.user, serverTime: new Date().toISOString() });
  }));
  app.post('/api/rooms',handle((req,res)=>{
    if(!requireAdminOrManager(req,res))return;
    const name=String(req.body.name||'').trim();if(!name || name.length>100)fail(400,'Nombre inválido');
    const id=crypto.randomUUID();db().prepare('INSERT INTO rooms (id,name) VALUES (?,?)').run(id,name);res.status(201).json({room:{id,name}});
  }));
  app.post('/api/tables',handle((req,res)=>{
    if(!requireAdminOrManager(req,res))return;
    const name=String(req.body.name||'').trim();if(!name || name.length>100 || !db().prepare('SELECT id FROM rooms WHERE id=?').get(req.body.room))fail(400,'Mesa o salón inválido');
    const result=db().prepare('INSERT INTO restaurant_tables (room,name) VALUES (?,?)').run(req.body.room,name);res.status(201).json({id:result.lastInsertRowid});
  }));
  app.patch('/api/tables/:id',handle((req,res)=>{
    if(!['admin','gerente','mesero','cajero'].includes(req.user.role))fail(403,'Permiso insuficiente');
    if(!['libre','ocupada','pedido'].includes(req.body.status))fail(400,'Estado inválido');
    const result=db().prepare('UPDATE restaurant_tables SET status=?, customer=?, waiter=? WHERE id=? AND status=?').run(req.body.status,'',req.body.status==='libre'?'':req.user.name,req.params.id,req.body.expectedStatus);
    if(!result.changes)fail(409,'La mesa cambió. Actualiza e intenta nuevamente.');res.json({success:true});
  }));
  app.post('/api/shifts/open', handle((req, res) => {
    const opening = cents(req.body.openingCash);
    db().transaction(() => {
      if (db().prepare('SELECT id FROM shifts WHERE closed_at IS NULL').get()) fail(409, 'Ya hay una caja abierta.');
      db().prepare('INSERT INTO shifts (opened_by, opened_at, opening_cents) VALUES (?,?,?)').run(req.user.id, new Date().toISOString(), opening);
    })();
    res.json({ shift: shiftState() });
  }));
  app.post('/api/shifts/close', handle((req, res) => {
    const observed = cents(req.body.observedCash);
    db().transaction(() => {
      const shift = db().prepare('SELECT id FROM shifts WHERE closed_at IS NULL').get();
      if (!shift || shift.id !== Number(req.body.shiftId)) fail(409, 'La caja cambió. Actualiza antes de cerrar.');
      db().prepare('UPDATE shifts SET closed_at = ?, closed_by = ?, observed_cents = ? WHERE id = ?').run(new Date().toISOString(), req.user.id, observed, shift.id);
    })();
    res.json({ shift: shiftState() });
  }));
  const validProduct=body=>commerce.product({type:profile().default_product_type,...body});
  app.post('/api/products', handle((req, res) => {
    if (!requireAdminOrManager(req, res)) return;
    const p = validProduct(req.body);
    if(p.code && db().prepare('SELECT id FROM products WHERE lower(code)=lower(?) AND id<>?').get(p.code,Number(req.params.id)||0))fail(409,'El código ya pertenece a otro artículo');
    const info = db().transaction(()=>{
      const nextId=db().prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM (SELECT id FROM products UNION ALL SELECT product_id AS id FROM inventory_movements UNION ALL SELECT product_id AS id FROM sale_items)').get().id;
      const result=db().prepare('INSERT INTO products (id,name,category,price,stock,code,cost,min_stock,unit,type) VALUES (?,?,?,?,?,?,?,?,?,?)').run(nextId,p.name,p.category,p.price,p.stock,p.code,p.cost,p.min_stock,p.unit,p.type);
      db().prepare('INSERT OR IGNORE INTO inventory_categories(name) VALUES (?)').run(p.category);
      movement(result.lastInsertRowid,p.stock,p.stock,'Alta de producto',req.user.id);return result;
    })();
    res.status(201).json({ product: db().prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid) });
  }));
  app.put('/api/products/:id', handle((req, res) => {
    if (!requireAdminOrManager(req, res)) return;
    const p = validProduct(req.body);
    if(p.code && db().prepare('SELECT id FROM products WHERE lower(code)=lower(?) AND id<>?').get(p.code,Number(req.params.id)||0))fail(409,'El código ya pertenece a otro artículo');
    db().transaction(() => {
      const current = db().prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!current) fail(404, 'Producto no encontrado');
      if ((req.body.expectedVersion!==undefined && Number(req.body.expectedVersion)!==current.version) || Number(req.body.expectedStock) !== current.stock) fail(409, 'El inventario cambió. Actualiza y vuelve a editar.');
      db().prepare('UPDATE products SET name=?,category=?,price=?,stock=?,code=?,cost=?,min_stock=?,unit=?,type=?,version=version+1 WHERE id=?').run(p.name,p.category,p.price,p.stock,p.code,p.cost,p.min_stock,p.unit,p.type,req.params.id);
      db().prepare('INSERT OR IGNORE INTO inventory_categories(name) VALUES (?)').run(p.category);
      if(p.stock !== current.stock) movement(current.id,p.stock-current.stock,p.stock,'Edición de inventario',req.user.id);
    })();
    res.json({ product: db().prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) });
  }));
  app.delete('/api/products/:id', handle((req, res) => {
    if (!requireAdminOrManager(req, res)) return;
    const result = db().transaction(()=>{
      const current=db().prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
      if(current) movement(current.id,-current.stock,0,'Baja de producto',req.user.id);
      return db().prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    })();
    if (!result.changes) fail(404, 'Producto no encontrado');
    res.json({ success: true });
  }));
  app.post('/api/sales', handle(async (req, res) => {
    const input = req.body || {};
    const key = req.get('Idempotency-Key');
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) fail(400, 'Se requiere un identificador único de venta.');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = db().transaction(() => {
      const old = db().prepare('SELECT * FROM sale_requests WHERE request_key = ?').get(key);
      if (old) {
        if (old.user_id !== req.user.id || old.fingerprint !== fingerprint) fail(409, 'Identificador utilizado para otra venta.');
        return { saleId: old.sale_id, replayed: true };
      }
      const shift = db().prepare('SELECT id FROM shifts WHERE closed_at IS NULL').get();
      if (!shift) fail(409, 'Debe abrir la caja antes de vender.');
      if (!profile().payment_methods.includes(input.paymentMethod)) fail(400, 'Método de pago inválido.');
      if(input.currency && input.currency!==profile().currency_code)fail(409,'La moneda cambió. Revisa el carrito.');
      const calculated=commerce.checkout(db(),input,req.user,Number(profile().iva_rate));
      const {items,totals,percent,reason}=calculated;
      const subtotal=cents(totals.subtotal),tax=cents(totals.tax),total=cents(totals.total);
      let quote;
      if(input.quoteId) {
        quote=db().prepare('SELECT * FROM quotes WHERE id=?').get(input.quoteId);
        if(!quote || quote.converted_sale_id || quote.valid_until<new Date().toISOString())fail(409,'La cotización venció o ya fue convertida');
      }
      const received = input.paymentMethod === 'efectivo' ? cents(input.receivedAmount) : total;
      if (received < total) fail(400, 'Efectivo insuficiente.');
      const date = new Date().toISOString();
      const customer = { name: String(input.customerName || 'Cliente general').slice(0,200), nit: String(input.customerNit || 'CF').slice(0,40), email: String(input.customerEmail || '').slice(0,254), phone: String(input.customerPhone || '').slice(0,40), address: String(input.customerAddress || '').slice(0,1000) };
      if(input.documentType==='credito_fiscal' && (!String(input.customerName||'').trim() || !String(input.customerNit||'').trim() || String(input.customerNit).trim().toUpperCase()==='CF'))fail(400,'El crédito fiscal requiere nombre y NIT del receptor');
      const type = input.documentType === 'credito_fiscal' ? 'credito_fiscal' : 'consumidor_final';
      const info = db().prepare(`INSERT INTO sales (employee_name,payment_method,total,subtotal,tax,created_at,received_amount,change_amount,customer_name,customer_nit,customer_email,customer_phone,customer_address,document_type,customer_id,shift_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.name,input.paymentMethod,total/100,subtotal/100,tax/100,date,received/100,(received-total)/100,customer.name,customer.nit,customer.email,customer.phone,customer.address,type,input.customerId || null,shift.id);
      const saleId = info.lastInsertRowid;
      db().prepare('UPDATE sales SET gross=?,discount=?,discount_percent=?,discount_reason=?,quote_id=?,customer_department=?,customer_municipality=?,customer_giro=? WHERE id=?').run(totals.gross,totals.discount,percent,reason,quote?.id||null,String(input.customerDepartment||'').slice(0,100),String(input.customerMunicipality||'').slice(0,100),String(input.customerGiro||'').slice(0,200),saleId);
      if(quote)db().prepare('UPDATE quotes SET converted_sale_id=? WHERE id=?').run(saleId,quote.id);
      for (const it of items) {
        db().prepare('INSERT INTO sale_items (sale_id,product_id,name,price,qty,cost,unit,catalog_price,price_reason) VALUES (?,?,?,?,?,?,?,?,?)').run(saleId,it.id,it.name,it.price,it.qty,it.cost,it.unit,it.catalogPrice,it.priceReason);
        if(it.type==='servicio')continue;
        db().prepare('UPDATE products SET stock = ROUND(stock - ?,3),version=version+1 WHERE id = ?').run(it.qty,it.id);
        movement(it.id,-it.qty,db().prepare('SELECT stock FROM products WHERE id=?').get(it.id).stock,'Venta #'+saleId,req.user.id);
      }
      const { number } = nextInvoiceData();
      const xml = create({ Receipt: { Number: number, Date: date, Customer: customer.name, Total: total/100, FiscalStatus: 'NOT_AUTHORIZED', Item: items.map(it => ({ Name: it.name, Quantity: it.qty, Price: it.price })) } }).end({ prettyPrint: true });
      db().prepare('INSERT INTO invoices (sale_id,number,xml,pdf_path,customer_name,customer_nit,customer_email,document_type,printed) VALUES (?,?,?,?,?,?,?,?,?)').run(saleId,number,xml,'',customer.name,customer.nit,customer.email,type,0);
      db().prepare('UPDATE invoices SET profile_id=? WHERE sale_id=?').run(captureProfile(db(),profile()),saleId);
      addVatBookEntry({ number,subtotal:subtotal/100,tax:tax/100,total:total/100,createdAt:date,customerName:customer.name,customerNit:customer.nit,tipo_receptor:type });
      db().prepare('INSERT INTO sale_requests (request_key,user_id,fingerprint,sale_id) VALUES (?,?,?,?)').run(key,req.user.id,fingerprint,saleId);
      if(input.emailReceipt===true)db().prepare("INSERT INTO sale_email_delivery(sale_id,recipient,status,updated_at) VALUES (?,?,'ready',?)").run(saleId,customer.email.trim(),date);
      return { saleId, replayed: false };
    })();
    const invoice = db().prepare('SELECT number FROM invoices WHERE sale_id=?').get(result.saleId);
    let emailDelivery;
    try{emailDelivery=await sendSaleReceipt(db(),profile(),result.saleId);}catch(error){emailDelivery={status:'uncertain',message:'Venta registrada. No se pudo confirmar el correo; verifica el envío antes de reintentar.'};}
    res.json({ sale: saleFor(result.saleId), invoiceNumber: invoice.number, replayed: result.replayed, emailDelivery });
  }));
  app.get('/api/invoices/:saleId/pdf', handle((req, res) => {
    const document=loadDocument(db(),profile(),'sale',req.params.saleId);
    res.type('pdf').set('Content-Disposition',`inline; filename="${documentFilename(document)}.pdf"`);
    const doc=receiptDocument(document.issuer,document,document);
    doc.on('error', () => res.destroy());
    doc.pipe(res);
    doc.end();
  }));
};
