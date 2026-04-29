const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Archivo JSON como base de datos simple
const DB_FILE = path.join(__dirname, 'data.json');

function leerDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error leyendo DB:', e.message);
  }
  
  return {
    estado: {
      nombre: 'República Digital de Krakonia',
      capital: 'Nova Valentía',
      moneda: 'Krako (KKS)',
      lema: 'Unidad, Progreso, Soberanía Digital',
      fundado: null,
      reservaNacional: 1000000
    },
    usuarios: [],
    leyes: [],
    transacciones: [],
    consejo: [],
    diario: [],
    votos: []
  };
}

function guardarDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error guardando DB:', e.message);
  }
}

let db = leerDB();

// Guardar cada 30 segundos
setInterval(() => guardarDB(db), 30000);

console.log('✅ Base de datos iniciada');
console.log('👥 Usuarios:', db.usuarios.length);

// ========== API ==========

app.get('/api/estado', (req, res) => {
  const circulacion = db.usuarios.reduce((t, u) => t + (u.balance || 0), 0);
  res.json({ ...db.estado, poblacion: db.usuarios.length, circulacion });
});

app.post('/api/fundar', (req, res) => {
  const { nombre, email, password } = req.body;
  
  if (db.usuarios.find(u => u.rol === 'lider')) {
    return res.json({ error: 'Krakonia ya tiene Líder. Usa /api/registro' });
  }
  
  if (db.usuarios.find(u => u.email === email)) {
    return res.json({ error: 'Email ya registrado' });
  }

  const lider = {
    id: 'lider-' + Date.now(),
    krakoID: 'KR-LIDER-' + Date.now().toString(36).toUpperCase(),
    nombreLegal: nombre,
    email,
    password,
    rol: 'lider',
    balance: 1000,
    fecha: new Date().toISOString()
  };

  db.estado.fundado = new Date().toISOString();
  db.usuarios.push(lider);
  db.reservaNacional = (db.reservaNacional || 1000000) - 1000;
  
  db.transacciones.push({
    id: 'trx-' + Date.now(),
    de: 'Banco Central',
    para: nombre,
    cantidad: 1000,
    concepto: 'Balance inicial del Líder',
    fecha: new Date().toISOString()
  });

  db.diario.push({
    id: 'diario-' + Date.now(),
    tipo: 'FUNDACION',
    descripcion: `Fundación de Krakonia por ${nombre}`,
    actor: nombre,
    fecha: new Date().toISOString()
  });

  guardarDB(db);
  res.json({ exito: true, usuario: lider });
});

app.post('/api/registro', (req, res) => {
  const { nombre, email, password } = req.body;
  
  if (!db.estado.fundado) {
    return res.json({ error: 'Krakonia no ha sido fundada aún' });
  }
  
  if (db.usuarios.find(u => u.email === email)) {
    return res.json({ error: 'Email ya registrado' });
  }

  const ciudadano = {
    id: 'ciu-' + Date.now(),
    krakoID: 'KR-' + email.split('@')[0].toUpperCase() + '-' + Date.now().toString(36).substring(0,4).toUpperCase(),
    nombreLegal: nombre,
    email,
    password,
    rol: 'ciudadano',
    balance: 100,
    fecha: new Date().toISOString()
  };

  db.usuarios.push(ciudadano);
  
  db.transacciones.push({
    id: 'trx-' + Date.now(),
    de: 'Banco Central',
    para: nombre,
    cantidad: 100,
    concepto: 'Bono de bienvenida',
    fecha: new Date().toISOString()
  });

  db.diario.push({
    id: 'diario-' + Date.now(),
    tipo: 'NUEVO_CIUDADANO',
    descripcion: `${nombre} ha obtenido la ciudadanía`,
    actor: nombre,
    fecha: new Date().toISOString()
  });

  guardarDB(db);
  res.json({ exito: true, usuario: ciudadano });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const usuario = db.usuarios.find(u => u.email === email);
  
  if (!usuario) return res.json({ error: 'Email no encontrado' });
  if (usuario.password !== password) return res.json({ error: 'Contraseña incorrecta' });
  
  res.json({ exito: true, usuario });
});

app.get('/api/ciudadanos', (req, res) => {
  res.json(db.usuarios.map(u => ({
    id: u.id, krako_id: u.krakoID, nombre_legal: u.nombreLegal,
    email: u.email, rol: u.rol, balance: u.balance, fecha_registro: u.fecha
  })));
});

app.get('/api/leyes', (req, res) => {
  res.json(db.leyes);
});

app.post('/api/leyes', (req, res) => {
  const { titulo, contenido, autor_id } = req.body;
  const autor = db.usuarios.find(u => u.id === autor_id);
  
  const ley = {
    id: 'ley-' + Date.now(),
    titulo,
    contenido,
    tipo: 'ley',
    estado: 'propuesta',
    autor: autor ? autor.nombreLegal : 'Anónimo',
    fecha: new Date().toISOString()
  };
  
  db.leyes.push(ley);
  guardarDB(db);
  res.json({ exito: true, id: ley.id });
});

app.put('/api/leyes/:id/votacion', (req, res) => {
  const ley = db.leyes.find(l => l.id === req.params.id);
  if (ley) ley.estado = 'en_votacion';
  guardarDB(db);
  res.json({ exito: true });
});

app.get('/api/leyes/:id/votos', (req, res) => {
  const votos = db.votos.filter(v => v.leyId === req.params.id);
  res.json(votos);
});

app.post('/api/votar', (req, res) => {
  const { ley_id, usuario_id, voto } = req.body;
  
  if (db.votos.find(v => v.leyId === ley_id && v.usuarioId === usuario_id)) {
    return res.json({ error: 'Ya has votado' });
  }

  db.votos.push({
    id: 'voto-' + Date.now(),
    leyId: ley_id,
    usuarioId: usuario_id,
    voto,
    fecha: new Date().toISOString()
  });

  const usuario = db.usuarios.find(u => u.id === usuario_id);
  if (usuario) usuario.balance += 5;
  
  guardarDB(db);
  res.json({ exito: true });
});

app.get('/api/consejo', (req, res) => {
  const miembros = db.consejo.map(c => {
    const u = db.usuarios.find(u => u.id === c.usuarioId);
    return { ...c, nombre_legal: u ? u.nombreLegal : 'Desconocido' };
  });
  res.json(miembros);
});

app.post('/api/consejo', (req, res) => {
  const { usuario_id, cargo } = req.body;
  
  db.consejo.push({
    id: 'con-' + Date.now(),
    usuarioId: usuario_id,
    cargo,
    fecha_nombramiento: new Date().toISOString()
  });

  const usuario = db.usuarios.find(u => u.id === usuario_id);
  if (usuario && usuario.rol === 'ciudadano') usuario.rol = 'consejo';
  
  guardarDB(db);
  res.json({ exito: true });
});

app.get('/api/transacciones', (req, res) => {
  res.json(db.transacciones.slice(-50).reverse());
});

app.post('/api/emitir', (req, res) => {
  const { usuario_id, cantidad, concepto } = req.body;
  const usuario = db.usuarios.find(u => u.id === usuario_id);
  
  if (!usuario) return res.json({ error: 'Usuario no encontrado' });
  
  usuario.balance += cantidad;
  
  db.transacciones.push({
    id: 'trx-' + Date.now(),
    de: 'Banco Central',
    para: usuario.nombreLegal,
    cantidad,
    concepto,
    fecha: new Date().toISOString()
  });
  
  guardarDB(db);
  res.json({ exito: true });
});

app.get('/api/diario', (req, res) => {
  res.json(db.diario.slice(-50).reverse());
});

// Ruta para el frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🏛️  Krakonia operativa en http://localhost:${PORT}`);
  console.log('🌍  Capital: Nova Valentía');
});