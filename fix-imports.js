// Fix imports in compiled JavaScript files to add .js extension
const fs = require('fs');
const path = require('path');

const dir = 'dist/setup';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix relative imports
  content = content.replace(/from '\.\/setup-([\w-]+)'/g, "from './setup-$1.js'");
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed imports in ${file}`);
});
