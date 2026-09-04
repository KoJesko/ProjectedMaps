const d3=require('d3-geo');
function distortion(proj,ll){
  var e=0.02,lon=ll[0],lat=ll[1],phi=lat*Math.PI/180,cos=Math.cos(phi);
  var pE1=proj([lon-e,lat]),pE2=proj([lon+e,lat]),pN1=proj([lon,lat-e]),pN2=proj([lon,lat+e]);
  var d=2*e*Math.PI/180;
  var a1=(pE2[0]-pE1[0])/(d*cos),b1=(pE2[1]-pE1[1])/(d*cos);
  var a2=(pN2[0]-pN1[0])/d,b2=(pN2[1]-pN1[1])/d;
  var det=Math.abs(a1*b2-a2*b1);
  var E=a1*a1+b1*b1,G=a2*a2+b2*b2,F=a1*a2+b1*b2;
  var t=Math.sqrt(Math.max(0,(E-G)*(E-G)+4*F*F));
  var s1=Math.sqrt((E+G+t)/2),s2=Math.sqrt(Math.max(0,(E+G-t)/2));
  var om=2*Math.asin(Math.min(1,(s1-s2)/(s1+s2)));
  return {omega:om*180/Math.PI,area:det};
}
const LOME=[1.2833,6.1167],OUAGA=[-1.5197,12.3714];
function report(name,p,pts){
  const ref=distortion(p,LOME);
  console.log('\n'+name);
  pts.forEach(([lbl,c])=>{
    const d=distortion(p,c);
    console.log('  '+lbl.padEnd(22)+' omega='+d.omega.toFixed(3).padStart(7)+'deg  area x'+(d.area/ref.area).toFixed(4));
  });
}
const pts=[['Lome 6N',LOME],['Ouagadougou 12N',OUAGA],['Paris 49N',[2.35,48.85]],['Nuuk 64N',[-51.7,64.2]]];

let ee=d3.geoEqualEarth(); ee.fitExtent([[0,0],[800,400]],{type:'Sphere'});
report('Equal Earth (expect area x1.000 everywhere, omega > 0)',ee,pts);

let m=d3.geoMercator(); m.fitExtent([[0,0],[800,600]],{type:'Polygon',coordinates:[[[-180,-82],[-180,82],[180,82],[180,-82],[-180,-82]]]});
report('Web Mercator (expect omega=0.000, area grows north)',m,pts);

let lcc=d3.geoConicConformal().parallels([5.5,15.5]).rotate([2,0]);
lcc.fitExtent([[0,0],[800,600]],{type:'Polygon',coordinates:[[[-12,3],[-12,18],[8,18],[8,3],[-12,3]]]});
report('Lambert conformal conic (expect omega=0.000)',lcc,[pts[0],pts[1]]);

let ae=d3.geoAzimuthalEquidistant().rotate([-LOME[0],-LOME[1]]);
ae.fitExtent([[0,0],[800,800]],d3.geoCircle().center(LOME).radius(15)());
console.log('\nAzimuthal equidistant: true-scale distance check from Lome');
[250,500,1000].forEach(km=>{
  const R=6371.0088, o=ae(LOME);
  const north=ae([LOME[0],LOME[1]+km/R*180/Math.PI]);
  const east =d3.geoCircle().center(LOME).radius(km/R*180/Math.PI)().coordinates[0][0];
  const pe=ae(east);
  const rN=Math.hypot(north[0]-o[0],north[1]-o[1]), rE=Math.hypot(pe[0]-o[0],pe[1]-o[1]);
  console.log('  '+km+'km ring: radius north='+rN.toFixed(2)+'px east='+rE.toFixed(2)+'px  ratio='+(rN/rE).toFixed(5));
});

// Task-specific measurements, same formulas as app.js.
function distanceScale(proj,from,to){
  const a=proj(from),b=proj(to),s0=distortion(proj,from);
  return Math.hypot(b[0]-a[0],b[1]-a[1])/(d3.geoDistance(from,to)*Math.sqrt(s0.area));
}
function geodesic(a,b,n){
  const f1=a[1]*Math.PI/180,l1=a[0]*Math.PI/180,f2=b[1]*Math.PI/180,l2=b[0]*Math.PI/180;
  const dd=d3.geoDistance(a,b),sd=Math.sin(dd),pts=[];
  for(let i=0;i<=n;i++){const f=i/n,A=Math.sin((1-f)*dd)/sd,B=Math.sin(f*dd)/sd;
    const x=A*Math.cos(f1)*Math.cos(l1)+B*Math.cos(f2)*Math.cos(l2),y=A*Math.cos(f1)*Math.sin(l1)+B*Math.cos(f2)*Math.sin(l2),z=A*Math.sin(f1)+B*Math.sin(f2);
    pts.push([Math.atan2(y,x)*180/Math.PI,Math.atan2(z,Math.hypot(x,y))*180/Math.PI]);}
  return pts;
}
function geodesicBow(proj,from,to){
  const a=proj(from),b=proj(to),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  let worst=0;
  geodesic(from,to,200).forEach(c=>{const p=proj(c);worst=Math.max(worst,Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/len);});
  return worst/len;
}
const BAMAKO=[-8.0029,12.6392];
console.log('\nDistance scale Lome -> Ouagadougou (expect azimuthal equidistant = 1.0000)');
console.log('  azimuthal equidistant x'+distanceScale(ae,LOME,OUAGA).toFixed(4));
console.log('  Web Mercator          x'+distanceScale(m,LOME,OUAGA).toFixed(4));
console.log('  Equal Earth           x'+distanceScale(ee,LOME,OUAGA).toFixed(4));
let gn=d3.geoGnomonic().rotate([3.36,-9.38]).clipAngle(60);
gn.fitExtent([[0,0],[800,600]],d3.geoCircle().center([-3.36,9.38]).radius(12.6)());
console.log('\nGeodesic bow off straight screen line, Lome -> Bamako (expect gnomonic = 0.00%)');
console.log('  gnomonic     '+(100*geodesicBow(gn,LOME,BAMAKO)).toFixed(3)+'%');
console.log('  Web Mercator '+(100*geodesicBow(m,LOME,BAMAKO)).toFixed(3)+'%');
console.log('  Equal Earth  '+(100*geodesicBow(ee,LOME,BAMAKO)).toFixed(3)+'%');
