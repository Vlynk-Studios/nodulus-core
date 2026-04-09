import express from 'express';
import { createApp } from '../../../../src/index.js';

export const app = express();
app.use(express.json());

export const boot = async () => {
  return await createApp(app, {
    modules: 'src/modules/*',
    prefix: '/api',
    aliases: {
      '@config': './src/config',
      '@middleware': './src/middleware'
    }
  });
};
