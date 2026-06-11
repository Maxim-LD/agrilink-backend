import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { login, loginSchema } from '../controllers/auth.controller';

const router = Router();

router.post('/login', validate(loginSchema), login);

export default router;
