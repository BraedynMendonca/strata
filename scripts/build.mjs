import {cp, mkdir, rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/vendor',{recursive:true});
for (const name of ['index.html','research.html','app.css','app.js','planner-rules.js','planner-calculator.js','planner-exports.js','heat.css','heat.js','analysis.js','places.json','icon.svg','strata-logo.svg','strata-icon.png','apple-touch-icon.png','favicon-32.png','favicon.ico']) await cp(`web/${name}`,`dist/${name}`);
for (const name of ['leaflet.js','leaflet.css']) await cp(`web/vendor/${name}`,`dist/vendor/${name}`);
await cp('web/heat','dist/heat',{recursive:true});
await cp('web/planner','dist/planner',{recursive:true});
console.log('Static school discovery and San José research built in dist/');
