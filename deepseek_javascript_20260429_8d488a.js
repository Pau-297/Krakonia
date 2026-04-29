const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos
const db = new Database('krakonia.db');

// Crear tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS estado (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre TEXT DEFAULT 'República Digital de Krakonia',
    capital TEXT DEFAULT 'Nova Valentía',
    moneda TEXT DEFAULT 'Krako (KKS)',
    lema TEXT DEFAULT 'Unidad, Progreso, Soberanía Digital',
    fundado TEXT,
    reserva_nacional INTEGER DEFAULT 1000000
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    krako_id TEXT UNIQUE NOT NULL,
    nombre_legal TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT DEFAULT 'ciudadano',
    balance INTEGER DEFAULT 0,
    fecha_registro TEXT DEFAULT (datetime('now')),
    activo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS leyes (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    contenido TEXT NOT NULL,
    tipo TEXT DEFAULT 'ley',
    estado TEXT DEFAULT 'propuesta',
    autor TEXT,
    fecha TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS votos (
    id TEXT PRIMARY KEY,
    ley_id TEXT NOT NULL,
    usuario_id TEXT NOT NULL,
    voto TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now')),
    UNIQUE(ley_id, usuario_id)
  );

  CREATE TABLE IF NOT EXISTS transacciones (
    id TEXT PRIMARY KEY,
    de TEXT NOT NULL,
    para TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    concepto TEXT,
    fecha TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS consejo (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    cargo TEXT NOT NULL,
    fecha_nombramiento TEXT DEFAULT (datetime('now')),
    votos_participados INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS diario_oficial (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    actor TEXT,
    fecha TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    fecha TEXT NOT NULL,
    lugar TEXT,
    tipo TEXT DEFAULT 'nacional',
    asistentes INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO estado (id) VALUES (1);
`);

console.log('✅ Base de datos iniciada');

// ========== API ENDPOINTS ==========

// Estado
app.get('/api/estado', (req, res) => {
  const estado = db.prepare('SELECT * FROM estado WHERE id = 1').get();
  const poblacion = db.prepare('SELECT COUNT(*) as total FROM usuarios WHERE activo = 1').get();
  const circulacion = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM usuarios').get();
  res.json({ ...estado, poblacion: poblacion.total, circulacion: circulacion.total });
});

// Fundar estado (solo una vez)
app.post('/api/fundar', (req, res) => {
  const { nombre, email, password } = req.body;
  
  const existeLider = db.prepare("SELECT id FROM usuarios WHERE rol = 'lider'").get();
  if (existeLider) {
    return res.status(400).json({ error: 'Krakonia ya tiene un Líder Fundador. Usa /api/registro para ser ciudadano.' });
  }

  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) {
    return res.status(400).json({ error: 'Email ya registrado' });
  }

  const liderId = 'lider-' + Date.now().toString(36);
  const krakoId = 'KR-LIDER-' + Date.now().toString(36).toUpperCase();

  db.prepare(`INSERT INTO usuarios (id, krako_id, nombre_legal, email, password, rol, balance) 
              VALUES (?, ?, ?, ?, ?, 'lider', 1000)`).run(liderId, krakoId, nombre, email, password);
  
  db.prepare("UPDATE estado SET fundado = datetime('now'), reserva_nacional = reserva_nacional - 1000 WHERE id = 1").run();
  
  db.prepare(`INSERT INTO transacciones (id, de, para, cantidad, concepto) VALUES (?, 'Banco Central', ?, 1000, 'Balance inicial')`)
    .run('trx-' + Date.now().toString(36), liderId);
  
  db.prepare(`INSERT INTO diario_oficial (id, tipo, descripcion, actor) VALUES (?, 'FUNDACION', ?, ?)`)
    .run('diario-' + Date.now().toString(36), `Fundación de Krakonia por ${nombre}`, nombre);

  res.json({ exito: true, mensaje: '¡Krakonia ha sido fundada!', usuario: { id: liderId, krako_id: krakoId, nombre_legal: nombre, email, rol: 'lider', balance: 1000 } });
});

// Registro ciudadano
app.post('/api/registro', (req, res) => {
  const { nombre, email, password } = req.body;
  
  const estado = db.prepare('SELECT fundado FROM estado WHERE id = 1').get();
  if (!estado.fundado) {
    return res.status(400).json({ error: 'Krakonia aún no ha sido fundada. Espera a que el Líder la funde.' });
  }

  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) {
    return res.status(400).json({ error: 'Email ya registrado' });
  }

  const userId = 'ciu-' + Date.now().toString(36);
  const krakoId = 'KR-' + email.split('@')[0].toUpperCase() + '-' + Date.now().toString(36).substring(0,4).toUpperCase();

  db.prepare(`INSERT INTO usuarios (id, krako_id, nombre_legal, email, password, rol, balance) 
              VALUES (?, ?, ?, ?, ?, 'ciudadano', 100)`).run(userId, krakoId, nombre, email, password);
  
  db.prepare("UPDATE estado SET reserva_nacional = reserva_nacional - 100 WHERE id = 1").run();
  
  db.prepare(`INSERT INTO transacciones (id, de, para, cantidad, concepto) VALUES (?, 'Banco Central', ?, 100, 'Bono de bienvenida')`)
    .run('trx-' + Date.now().toString(36), userId);
  
  db.prepare(`INSERT INTO diario_oficial (id, tipo, descripcion, actor) VALUES (?, 'NUEVO_CIUDADANO', ?, ?)`)
    .run('diario-' + Date.now().toString(36), `${nombre} ha obtenido la ciudadanía`, nombre);

  res.json({ exito: true, mensaje: '¡Ciudadanía concedida!', usuario: { id: userId, krako_id: krakoId, nombre_legal: nombre, email, rol: 'ciudadano', balance: 100 } });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);
  
  if (!usuario) return res.status(401).json({ error: 'Krako ID no encontrado' });
  if (usuario.password !== password) return res.status(401).json({ error: 'Contraseña incorrecta' });
  
  res.json({ exito: true, usuario });
});

// Ciudadanos
app.get('/api/ciudadanos', (req, res) => {
  const ciudadanos = db.prepare('SELECT id, krako_id, nombre_legal, email, rol, balance, fecha_registro FROM usuarios WHERE activo = 1 ORDER BY fecha_registro DESC').all();
  res.json(ciudadanos);
});

app.put('/api/ciudadanos/:id/rol', (req, res) => {
  const { rol } = req.body;
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!usuario) return res.status(404).json({ error: 'No encontrado' });
  if (usuario.rol === 'lider') return res.status(400).json({ error: 'No se puede cambiar al líder' });
  db.prepare('UPDATE usuarios SET rol = ? WHERE id = ?').run(rol, req.params.id);
  res.json({ exito: true });
});

// Leyes
app.get('/api/leyes', (req, res) => {
  const leyes = db.prepare('SELECT * FROM leyes ORDER BY fecha DESC').all();
  res.json(leyes);
});

app.post('/api/leyes', (req, res) => {
  const { titulo, contenido, autor_id } = req.body;
  const autor = db.prepare('SELECT nombre_legal FROM usuarios WHERE id = ?').get(autor_id);
  const id = 'ley-' + Date.now().toString(36);
  
  db.prepare('INSERT INTO leyes (id, titulo, contenido, autor) VALUES (?, ?, ?, ?)').run(id, titulo, contenido, autor?.nombre_legal);
  db.prepare("INSERT INTO diario_oficial (id, tipo, descripcion, actor) VALUES (?, 'LEY_PROPUESTA', ?, ?)")
    .run('diario-' + Date.now().toString(36), `Propuesta: ${titulo}`, autor?.nombre_legal);
  
  res.json({ exito: true, id });
});

app.put('/api/leyes/:id/votacion', (req, res) => {
  db.prepare("UPDATE leyes SET estado = 'en_votacion' WHERE id = ?").run(req.params.id);
  res.json({ exito: true });
});

// Votos
app.get('/api/leyes/:id/votos', (req, res) => {
  const votos = db.prepare('SELECT v.*, u.nombre_legal FROM votos v JOIN usuarios u ON v.usuario_id = u.id WHERE v.ley_id = ?').all(req.params.id);
  res.json(votos);
});

app.post('/api/votar', (req, res) => {
  const { ley_id, usuario_id, voto } = req.body;
  
  if (db.prepare('SELECT id FROM votos WHERE ley_id = ? AND usuario_id = ?').get(ley_id, usuario_id)) {
    return res.status(400).json({ error: 'Ya has votado en esta ley' });
  }

  db.prepare('INSERT INTO votos (id, ley_id, usuario_id, voto) VALUES (?, ?, ?, ?)')
    .run('voto-' + Date.now().toString(36), ley_id, usuario_id, voto);
  
  db.prepare('UPDATE usuarios SET balance = balance + 5 WHERE id = ?').run(usuario_id);
  db.prepare("INSERT INTO transacciones (id, de, para, cantidad, concepto) VALUES (?, 'Banco Central', ?, 5, 'Recompensa por voto')")
    .run('trx-' + Date.now().toString(36), usuario_id);
  
  res.json({ exito: true, mensaje: 'Voto registrado +5 KKS' });
});

app.put('/api/leyes/:id/finalizar', (req, res) => {
  const leyId = req.params.id;
  const votos = db.prepare('SELECT voto, usuario_id FROM votos WHERE ley_id = ?').all(leyId);
  const totalConsejo = db.prepare('SELECT COUNT(*) as total FROM consejo').get().total;
  const totalMiembros = totalConsejo + 1;
  
  const favor = votos.filter(v => v.voto === 'a_favor').length;
  const mayoria = Math.ceil(totalMiembros / 2);
  
  if (favor >= mayoria) {
    db.prepare("UPDATE leyes SET estado = 'aprobada' WHERE id = ?").run(leyId);
    votos.filter(v => v.voto === 'a_favor').forEach(v => {
      db.prepare('UPDATE usuarios SET balance = balance + 10 WHERE id = ?').run(v.usuario_id);
    });
    res.json({ exito: true, estado: 'aprobada' });
  } else {
    db.prepare("UPDATE leyes SET estado = 'rechazada' WHERE id = ?").run(leyId);
    res.json({ exito: true, estado: 'rechazada' });
  }
});

// Consejo
app.get('/api/consejo', (req, res) => {
  const miembros = db.prepare('SELECT c.*, u.nombre_legal FROM consejo c JOIN usuarios u ON c.usuario_id = u.id').all();
  res.json(miembros);
});

app.post('/api/consejo', (req, res) => {
  const { usuario_id, cargo } = req.body;
  db.prepare('INSERT INTO consejo (id, usuario_id, cargo) VALUES (?, ?, ?)').run('con-' + Date.now().toString(36), usuario_id, cargo);
  db.prepare("UPDATE usuarios SET rol = 'consejo' WHERE id = ? AND rol = 'ciudadano'").run(usuario_id);
  res.json({ exito: true });
});

// Economía
app.get('/api/transacciones', (req, res) => {
  const transacciones = db.prepare('SELECT * FROM transacciones ORDER BY fecha DESC LIMIT 50').all();
  res.json(transacciones);
});

app.post('/api/emitir', (req, res) => {
  const { usuario_id, cantidad, concepto } = req.body;
  const estado = db.prepare('SELECT reserva_nacional FROM estado WHERE id = 1').get();
  
  if (cantidad > estado.reserva_nacional) {
    return res.status(400).json({ error: 'Fondos insuficientes en la reserva nacional' });
  }
  
  db.prepare('UPDATE usuarios SET balance = balance + ? WHERE id = ?').run(cantidad, usuario_id);
  db.prepare('UPDATE estado SET reserva_nacional = reserva_nacional - ? WHERE id = 1').run(cantidad);
  db.prepare("INSERT INTO transacciones (id, de, para, cantidad, concepto) VALUES (?, 'Banco Central', ?, ?, ?)")
    .run('trx-' + Date.now().toString(36), usuario_id, cantidad, concepto);
  
  res.json({ exito: true });
});

// Diario
app.get('/api/diario', (req, res) => {
  const diario = db.prepare('SELECT * FROM diario_oficial ORDER BY fecha DESC LIMIT 50').all();
  res.json(diario);
});

// Eventos
app.get('/api/eventos', (req, res) => {
  const eventos = db.prepare('SELECT * FROM eventos ORDER BY fecha DESC').all();
  res.json(eventos);
});

app.post('/api/eventos', (req, res) => {
  const { nombre, fecha, lugar, tipo } = req.body;
  db.prepare('INSERT INTO eventos (id, nombre, fecha, lugar, tipo) VALUES (?, ?, ?, ?, ?)')
    .run('evt-' + Date.now().toString(36), nombre, fecha, lugar, tipo || 'nacional');
  res.json({ exito: true });
});

// Ruta principal - servir el frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🏛️  Krakonia operativa en puerto', PORT);
  console.log('🌍  Capital: Nova Valentía');
});