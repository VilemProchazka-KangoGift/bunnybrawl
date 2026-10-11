import {drawLavaRock} from './baseline-rock.js';

export function drawCombinedRock(c,rock,theme,variant,speed,time){
  const s=rock.size,count=[6,4,5,6][variant],spacing=[.06,.065,.055,.075][variant];
  for(let j=count-1;j>=0;j--){
    const age=j*spacing,fade=1-j/count,r=s*([.85,.62,.72,.65][variant]-j*.055);
    const drift=Math.sin(j*2.7+variant)*(variant===3?s:s*.55);
    c.save();c.translate(rock.x+drift,rock.y-speed*age-s*.4);c.rotate(Math.sin(j+time)*.25);
    c.globalAlpha=(variant===1?.58:.55)*fade;
    c.beginPath();for(let k=0;k<16;k++){const a=k*Math.PI/8,rr=r*(1+.2*Math.sin(k*2.2+j));c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr*(variant===0?.8:1));}c.closePath();
    c.fillStyle=['#C7AE94','#ACA19A','#C0A68F','#C9B39A'][variant];c.strokeStyle='#624B40';c.lineWidth=1;c.fill();c.stroke();c.restore();
  }
  c.save();c.translate(rock.x,rock.y);c.fillStyle=theme.lavaRockConfig?.glowColor||'#FF6600';c.globalAlpha=.3;
  c.beginPath();
  if(variant===0){for(let k=0;k<48;k++){const a=k*Math.PI/24,r=s*(1.75+.21*Math.sin(a*7)+.13*Math.sin(a*3+.8));c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}
  else if(variant===1){c.moveTo(-s*1.5,s*.6);c.bezierCurveTo(-s*2,-s*.4,-s*1.1,-s*1.8,-s*.7,-s*2.8);c.quadraticCurveTo(-s*.3,-s*1.5,0,-s*3.4);c.quadraticCurveTo(s*.4,-s*2,s*.8,-s*2.7);c.bezierCurveTo(s*.8,-s*1.3,s*2,-s*.3,s*1.4,s*.8);c.quadraticCurveTo(0,s*1.9,-s*1.5,s*.6);c.fill();}
  else if(variant===2){for(let k=0;k<20;k++){const a=k*Math.PI/10-.2,r=s*(k%2?1.4:2+.22*Math.sin(k*1.7));c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}
  else{for(let k=0;k<7;k++){const a=k*Math.PI*2/7,r=s*(1.3+.12*Math.sin(k*2));c.beginPath();c.ellipse(Math.cos(a)*r,Math.sin(a)*r,s*.7,s*.45,a,0,Math.PI*2);c.fill();}}
  c.restore();
  const fill=c.fill;let first=true;c.fill=function(...args){if(first){first=false;return;}return fill.apply(this,args);};
  try{drawLavaRock(c,rock,theme);}finally{c.fill=fill;}
}
