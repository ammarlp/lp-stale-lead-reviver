import dotenv from 'dotenv';
import path from 'path';

// Load server/.env regardless of process.cwd() — important because PM2
// runs us from the repo root, where dotenv's default lookup would miss it.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
