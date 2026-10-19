const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../web/analysis.js');
const grid = JSON.parse(fs.readFileSync(path.join(__dirname,'../web/heat/grid.json')));
const places = JSON.parse(fs.readFileSync(path.join(__dirname,'../web/places.json')));
const study = JSON.parse(fs.readFileSync(path.join(__dirname,'../web/heat/study.json')));
const synthetic = () => ({bounds:[-121.91,37.32,-121.89,37.34],shape:[21,21],
 predicted_c:Array.from({length:21},()=>Array(21).fill(1)), observed_c:Array.from({length:21},()=>Array(21).fill(2)),
 ndvi:Array.from({length:21},()=>Array(21).fill(.2)),priority:Array.from({length:21},()=>Array(21).fill(1))});
// Full-grid reference uses the spherical cosine law, independent of the optimized
// implementation's bounding-box search and haversine helper.
function reference(g,p,screen) {
 const [w,s,e,n]=g.bounds,[h,width]=g.shape;
 let count=0,pred=0,obs=0,ndvi=0,flagged=0;
 for(let r=0;r<h;r++)for(let c=0;c<width;c++){
  const la=(n-(r+.5)*(n-s)/h)*Math.PI/180,lo=(w+(c+.5)*(e-w)/width)*Math.PI/180;
  const lat=p.lat*Math.PI/180,lon=p.lon*Math.PI/180;
  const distance=Math.acos(Math.max(-1,Math.min(1,Math.sin(lat)*Math.sin(la)+Math.cos(lat)*Math.cos(la)*Math.cos(lo-lon))))*6371008.8;
  if(distance>300)continue;
  const x=g.predicted_c[r][c],y=g.observed_c[r][c],z=g.ndvi[r][c];
  if(![x,y,z].every(Number.isFinite)||x===-999||y===-999||z===-9)continue;
  count++;pred+=x;obs+=y;ndvi+=z;
  flagged+=screen.mode==='original'?Number(g.priority[r][c]===1):Number(x>0&&x>=screen.heat&&z<screen.ndvi);
 }
 return {count,predicted:pred/count,observed:obs/count,ndvi:ndvi/count,flaggedPercent:flagged/count*100};
}
test('grid validation rejects missing rows and invalid geometry',()=>{
 assert.equal(A.validateGrid(grid),grid);
 assert.throws(()=>A.validateGrid({...grid,bounds:[0,1,0,2]}));
 assert.throws(()=>A.validateGrid({...grid,priority:[]}));
});
test('cell mapping roundtrips centers and handles all footprint boundaries',()=>{
 for(const [r,c] of [[0,0],[266,270],[100,80]]){
  const p=A.cellCenter(grid,r,c);assert.deepEqual(A.cellForLocation(grid,p.lat,p.lon),{r,c});
 }
 const [w,s,e,n]=grid.bounds;
 assert.deepEqual(A.cellForLocation(grid,n,w),{r:0,c:0});
 assert.equal(A.cellForLocation(grid,s,w),null);assert.equal(A.cellForLocation(grid,n,e),null);
 assert.equal(A.cellForLocation(grid,NaN,w),null);assert.equal(A.cellForLocation(grid,n+.1,w),null);
});
test('custom threshold is inclusive for heat, exclusive for NDVI, and always positive',()=>{
 const g=synthetic(),screen={mode:'custom',heat:1,ndvi:.25};
 assert.equal(A.qualifies(g,10,10,screen),true);
 g.ndvi[10][10]=.25;assert.equal(A.qualifies(g,10,10,screen),false);
 g.ndvi[10][10]=.2;g.predicted_c[10][10]=0;
 assert.equal(A.qualifies(g,10,10,{...screen,heat:0}),false);
 g.predicted_c[10][10]=.5;assert.equal(A.qualifies(g,10,10,screen),false);
 assert.equal(A.qualifies(g,10,10),true,'original mask is independent of custom thresholds');
 for(const bad of [-999,null,NaN]){g.predicted_c[10][10]=bad;assert.equal(A.qualifies(g,10,10,screen),false);}
});
test('valid-cell denominator excludes nodata rather than counting it as unflagged',()=>{
 const g={bounds:[0,0,1,1],shape:[1,4],predicted_c:[[2,-999,1,0]],observed_c:[[2,-999,1,0]],ndvi:[[.1,.1,.1,.1]],priority:[[1,0,0,0]]};
 const result=A.screenSummary(g);
 assert.equal(result.valid,3);assert.equal(result.flagged,1);assert.ok(Math.abs(result.percent-100/3)<1e-12);
 g.ndvi[0][0]=-9;assert.equal(A.screenSummary(g).valid,2);
});
test('coverage threshold accepts 80% or more and withholds lower coverage',()=>{
 const g=synthetic(),center={lat:37.33,lon:-121.9};
 const cells=[];for(let r=0;r<21;r++)for(let c=0;c<21;c++)if(A.distanceM(center,A.cellCenter(g,r,c))<=300)cells.push([r,c]);
 const minValid=Math.ceil(cells.length*.8);
 for(const [r,c] of cells.slice(minValid))g.observed_c[r][c]=-999;
 let result=A.summarizeCircle(g,center);assert.equal(result.eligible,true);assert.equal(result.valid,minValid);
 const [r,c]=cells[minValid-1];g.observed_c[r][c]=-999;result=A.summarizeCircle(g,center);
 assert.equal(result.eligible,false);assert.equal(result.predicted,null);assert.equal(result.flaggedPercent,null);
});
test('boundary-crossing circles withhold means even when in-grid coverage is complete',()=>{
 const g=synthetic(),result=A.summarizeCircle(g,{lat:37.3399,lon:-121.9});
 assert.equal(result.crossesBoundary,true);assert.equal(result.coverage,1);assert.equal(result.eligible,false);assert.equal(result.observed,null);
});
test('real preset summaries match independent full-grid geographic calculations',()=>{
 for(const p of places) for(const screen of [A.DEFAULT_SCREEN,{mode:'custom',heat:1,ndvi:.25}]){
  const actual=A.summarizeCircle(grid,p,screen),expected=reference(grid,p,screen);
  assert.equal(actual.eligible,true,p.name);assert.equal(actual.valid,expected.count);
  for(const k of ['predicted','observed','ndvi','flaggedPercent'])assert.ok(Math.abs(actual[k]-expected[k])<1e-10,`${p.name}: ${k}`);
 }
});
test('custom exploration does not mutate the saved mask or archived study area',()=>{
 const before=JSON.stringify(grid.priority);const area=study.cooling_screen_area_ha;
 A.screenSummary(grid,{mode:'custom',heat:5,ndvi:.1});
 assert.equal(JSON.stringify(grid.priority),before);assert.equal(study.cooling_screen_area_ha,area);assert.equal(area,1620.7);
});
test('CSV and report preserve criteria, missing coverage, notes and spreadsheet safety',()=>{
 const areas=[{...places[0],notes:'Check "shade", then trees\nSecond line'},{name:'Boundary',lat:grid.bounds[3]-.0001,lon:-121.9,notes:'=1+1'}];
 const rows=A.reportRows(grid,areas,{mode:'custom',heat:1,ndvi:.25},study.prediction_date);
 assert.equal(rows[0].radius_m,300);assert.equal(rows[0].acquisition_date,'2025-08-31');assert.match(rows[0].screening_criteria,/>= 1.0 C/);
 assert.equal(rows[1].mean_observed_anomaly_c,'');assert.match(rows[1].status,/Withheld/);
 const csv=A.toCSV(rows);assert.match(csv,/Check ""shade"", then trees/);assert.match(csv,/"'=1\+1"/);
 assert.ok(csv.endsWith('\r\n'));assert.equal(A.toCSV([]),'');
});

// These immutable archived outputs are the scientific baseline for this UI work.
test('all six archived study assets remain byte-for-byte unchanged',()=>{
 const crypto=require('node:crypto');
 const expected={
  'study.json':'c5d262b5e9122e81fb0c9c5927328c99ff6d3351b7c49aef9c3a70bcc0bd86d4',
  'grid.json':'908276576fa5cdb374d49f3cc57333c75798db7501da644c5eb5e10cb1b47002',
  'predicted-anomaly.png':'fa52742ea454a787b3a63443b80c71a96bf01cf0ab896843e146e4652b9f98cb',
  'observed-anomaly.png':'561ebdf3214251640e6f1ba1c8df6ce435e18572ac33e65c113b9732ab7c94b5',
  'prediction-error.png':'8b408f7738f49c4b280363b02e32437bd984c3e658fbeffb835cdde32e8c64ea',
  'cooling-screen.png':'3986ed958effb1d302fa7782c7cc2a36a5121d8bb7dc76905956c90d3b73da2b'
 };
 for(const [name,hash]of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../web/heat',name))).digest('hex'),hash,name);
});

test('float32 serialization noise cannot put displayed-equal NDVI below a threshold',()=>{
 const g=synthetic();
 g.ndvi[10][10]=0.3499999940395355;
 assert.equal(A.qualifies(g,10,10,{mode:'custom',heat:1,ndvi:.35}),false);
 g.ndvi[10][10]=0.30000001192092896;
 assert.equal(A.qualifies(g,10,10,{mode:'custom',heat:1,ndvi:.30}),false);
 assert.equal(A.qualifies(g,10,10,{mode:'custom',heat:1,ndvi:.35}),true);
});
