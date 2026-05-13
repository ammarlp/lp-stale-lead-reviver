declare global {
  namespace Express {
    interface Request {
      userId?: string;
      subAccountId?: string | null;
    }
  }
}

export {};
