import type { Request, Response, NextFunction } from 'express';
export const validate = (req: Request, res: Response, next: NextFunction) => {
  if (!req.body) req.body = {};
  req.body.validated = true;
  next();
};
