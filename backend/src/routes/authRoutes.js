import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  updateProfileSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/google', authRateLimiter, validate(googleAuthSchema), authController.googleLogin);

router.get('/me', requireAuth, authController.me);
router.patch('/me', requireAuth, validate(updateProfileSchema), authController.updateMe);

export default router;
