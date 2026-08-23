import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import approvalRuleRoutes from './routes/approvalRuleRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import settlementRoutes from './routes/settlementRoutes.js';
import closureRoutes from './routes/closureRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

// Pass 4: fail fast and loudly if a secret the whole app depends on is
// missing, rather than booting successfully and only breaking (with a
// confusing jsonwebtoken internal error) on the first login/register
// request. DATABASE_URL is included too, for the same reason - src/config/db.js
// would otherwise create a Pool with an undefined connectionString and
// only surface that as a cryptic connection error on the first query.
// Skipped under NODE_ENV=test - the integration test suite's TEST_DATABASE_URL
// guard (see src/config/db.js) already covers that case with a more
// specific message, and this file isn't imported at all during
// `npm test` (tests build their own Express app - see any
// tests/integration/*.test.js).
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DATABASE_URL'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvVars.join(', ')}. ` +
      'Copy backend/.env.example to backend/.env and fill them in before starting the server.'
  );
  process.exit(1);
}

const app = express();
app.use(helmet());

// Pass 4: cors() with no options reflects Access-Control-Allow-Origin: *
// for every request, which is fine for a fully public read-only API but
// not for one with authenticated mutation endpoints. CORS_ORIGIN lets a
// real deployment restrict this to its actual frontend origin(s) without
// a code change; unset (the common local-dev case) falls back to Vite's
// default dev server origins so `npm run dev` on both sides keeps
// working exactly as before this change.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({ origin: corsOrigins }));

app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT now()');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (err) {
    console.error('Health check DB query failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/trips/:tripId/expenses', expenseRoutes);
app.use('/api/trips/:tripId/budget', budgetRoutes);
app.use('/api/trips/:tripId/approval-rules', approvalRuleRoutes);
app.use('/api/trips/:tripId/dashboard', dashboardRoutes);
app.use('/api/trips/:tripId/history', historyRoutes);
app.use('/api/trips/:tripId/settlement', settlementRoutes);
app.use('/api/trips/:tripId/closure', closureRoutes);
app.use('/api/notifications', notificationRoutes);

// Must be registered after all routes.
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`tripledger backend listening on port ${port}`);
});
