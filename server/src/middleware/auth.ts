import { RequestHandler } from 'express';
import { sb, getSubAccountIdByUser } from '../services/supabase';

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.header('authorization') || req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing access token' });

  const { data, error } = await sb().auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'invalid access token' });

  req.userId = data.user.id;
  next();
};

// Loads the user's sub_account_id and attaches it. Sub-account may be null
// for a freshly-signed-up user who hasn't completed onboarding yet.
export const attachSubAccount: RequestHandler = async (req, res, next) => {
  if (!req.userId) return res.status(401).json({ error: 'unauthenticated' });
  try {
    req.subAccountId = await getSubAccountIdByUser(req.userId);
    next();
  } catch (err) {
    next(err);
  }
};

// Use after attachSubAccount when a route requires a completed onboarding.
export const requireSubAccount: RequestHandler = (req, res, next) => {
  if (!req.subAccountId) return res.status(409).json({ error: 'onboarding required' });
  next();
};
