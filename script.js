const fs = require('fs');
const content = fs.readFileSync('src/components/ProjectDetail.tsx', 'utf-8');
const lines = content.split('\n');
const results = [];
lines.forEach((line, i) => {
  if (line.includes("language === 'en'") && !line.includes("=== 'fr'")) {
    results.push(`${i+1}: ${line.trim()}`);
  }
});
fs.writeFileSync('todo.txt', results.join('\n'));
