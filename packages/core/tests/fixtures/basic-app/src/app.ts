import express from 'express';
import { createApp } from '../../../../src/index.js';

export const app = express();
app.use(express.json());

export const boot = async () => {
  return await createApp(app);
};
