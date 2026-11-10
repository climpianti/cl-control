// Regression: the chart must be smooth WITHOUT inventing values between samples.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const text=fs.readFileSync(path.join(__dirname,'../custom_components/cl_control/frontend/cl-control-energy-card.mjs'),'utf8');
const sandbox={HTMLElement:class{},customElements:{get(){return undefined},define(){}},window:{}};
vm.createContext(sandbox);
vm.runInContext(text.replace('export {CLEnergyCard};','')+'\nthis.probe={monotoneEnergyPath,energyCurveSegments,card:CLEnergyCard.prototype}',sandbox);
const {monotoneEnergyPath:smooth,energyCurveSegments:segments,card}=sandbox.probe;
assert.equal(smooth([]),'');
assert.equal(smooth([{x:1,y:3}]),'M1,3');
assert.equal(segments([{x:0,y:0},null,{x:1,y:4},{x:2,y:4}]).length,2);
assert.equal(segments([{x:0,y:0},{x:0,y:2},{x:1,y:3}]).length,2);
const values=[{x:0,y:0},{x:10,y:7},{x:20,y:7},{x:30,y:3},{x:40,y:9}];
const d=smooth(values);
assert.ok(d.includes(' C'),d);
assert.doesNotMatch(d,/NaN|Infinity/);
const commands=[...d.matchAll(/ C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)];
assert.equal(commands.length,values.length-1);
commands.forEach((match,index)=>{
  const [x1,y1,x2,y2,x3,y3]=match.slice(1).map(Number),a=values[index].y,b=values[index+1].y;
  assert.equal(x3,values[index+1].x);
  assert.equal(y3,b);
  for(const t of [.1,.25,.5,.75,.9]){
    const omt=1-t;
    const interp=omt*omt*omt*a+3*omt*omt*t*y1+3*omt*t*t*y2+t*t*t*b;
    assert.ok(interp>=Math.min(a,b)-.001 && interp<=Math.max(a,b)+.001,'curve overshoot at '+index+': '+interp);
  }
});
const cfg={_plotWidth:390,_pointLabel:()=> '19:05',_range:'24h',_loadPointLabel:()=> '19:05'};
const series=[{t:1000,pv:0,home:.11,import:.11,export:0},{t:2000,pv:0,home:null,import:.05,export:0},{t:3000,pv:0,home:.08,import:.08,export:0}];
const svg=card._svgChart.call(cfg,series);
assert.ok(svg.includes('premiumCurveChart'));
assert.ok(svg.includes('chartArea') && svg.includes('chartHalo'));
assert.ok(svg.includes('clTrendFill-pv') && svg.includes('clTrendFill-import'));
assert.doesNotMatch(svg,/NaN|Infinity/);
const load=card._svgLoadChart.call(cfg,[{t:1000,value:120},{t:2000,value:null},{t:3000,value:80}]);
assert.ok(load.includes('premiumCurveChart'));
assert.doesNotMatch(load,/NaN|Infinity/);
assert.ok(text.includes('data-chart-tooltip') && text.includes('data-load-detail'));
console.log('Energy curves OK: smooth, monotone, gap-aware, real zero and no false SVG values.');
