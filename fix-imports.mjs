// Fix imports in compiled JavaScript files to add .js extension
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dir = path.join(__dirname, 'dist/setup');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix relative imports
  content = content.replace(/from '\.\/setup-([\w-]+)'/g, "from './setup-$1.js'");
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed imports in ${file}`);
});
